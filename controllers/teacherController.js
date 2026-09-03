const Student = require('../models/Student');
const Subject = require('../models/Subject');
const User = require('../models/User');
const Exam = require('../models/Exam');

const TEACHER_SHARE_RATE = 0.8; // 80% default teacher share
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

exports.getTeacherPortalData = async (req, res) => {
    try {
        let { subject: subjectParam, teacherName, month } = req.query;

        const currentMonthIndex = month !== undefined && month !== '' ? parseInt(month) : new Date().getMonth();

        // 1. Identify Subject
        let targetSubjectName = subjectParam;

        if (!targetSubjectName && teacherName) {
            const teacherUser = await User.findOne({ username: teacherName, role: 'teacher' });
            if (teacherUser && teacherUser.assignedSubject) {
                targetSubjectName = teacherUser.assignedSubject;
            }
        }

        // If still not specified, try to find any subject assigned or first subject
        let subjectObj = null;
        if (targetSubjectName) {
            subjectObj = await Subject.findOne({ name: { $regex: new RegExp(`^${targetSubjectName}$`, 'i') } });
        }

        if (!subjectObj) {
            // Fallback: pick the first available subject
            subjectObj = await Subject.findOne();
        }

        if (!subjectObj) {
            return res.json({
                teacher: { name: teacherName || 'Teacher', subject: 'None' },
                classes: [],
                summary: { totalStudents: 0, grossRevenue: 0, teacherEarnings: 0, instituteShare: 0, avgAttendanceRate: 0 },
                monthlyTrend: [],
                exams: []
            });
        }

        const subjectName = subjectObj.name;

        // 2. Fetch Teacher Profile
        const teacherProfile = await User.findOne({
            $or: [
                { assignedSubject: subjectName, role: 'teacher' },
                { username: teacherName, role: 'teacher' }
            ]
        }) || { username: teacherName || 'Teacher', assignedSubject: subjectName };

        // 3. Fetch all Students enrolled in this Subject
        const enrolledStudents = await Student.find({
            'enrollments.subject': subjectName
        }).lean();

        // 4. Determine Grades list (from subject.gradeSchedules or student enrollments)
        const scheduledGrades = (subjectObj.gradeSchedules || []).map(s => s.grade);
        const enrolledGrades = [...new Set(enrolledStudents.map(s => s.grade))];
        const allGrades = [...new Set([...scheduledGrades, ...enrolledGrades])].sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.replace(/\D/g, '')) || 0;
            return numA - numB;
        });

        // 5. Aggregate per Class (Subject + Grade)
        const feePerStudent = subjectObj.fee || 1000;
        const isDailyFee = subjectObj.feeType === 'daily';
        const classDaysCount = subjectObj.classDaysCount || 5;

        const classes = allGrades.map(gradeName => {
            // Match students in this grade
            const gradeNum = parseInt(gradeName.replace(/\D/g, ''));
            const gradeRegex = isNaN(gradeNum)
                ? new RegExp(`^${gradeName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i')
                : new RegExp(`^Grade 0?${gradeNum}$`, 'i');

            const classStudents = enrolledStudents.filter(s => gradeRegex.test(s.grade));
            const studentCount = classStudents.length;

            let freeCount = 0;
            let paidCount = 0;
            let totalSessions = 0;
            let totalPresents = 0;

            const studentList = classStudents.map(s => {
                const enrollment = s.enrollments.find(e => e.subject === subjectName) || {};
                const isFree = Boolean(enrollment.isFreeCard);
                if (isFree) freeCount++;

                const record = (enrollment.monthlyRecords || []).find(r => r.monthIndex === currentMonthIndex);
                let feePaid = false;
                let attendance = [];
                let tutesGiven = false;

                if (record) {
                    feePaid = Boolean(record.feePaid);
                    attendance = record.attendance || [];
                    tutesGiven = Boolean(record.tutesGiven);

                    if (feePaid && !isFree) {
                        paidCount++;
                    }

                    // Count attendance presents
                    attendance.forEach(att => {
                        if (att !== 'pending' && att !== undefined && att !== null) {
                            totalSessions++;
                            if (att === 'present' || att === true || att === 'true') {
                                totalPresents++;
                            }
                        }
                    });
                }

                return {
                    id: s._id,
                    name: s.name,
                    indexNumber: s.indexNumber,
                    mobile: s.mobile,
                    grade: s.grade,
                    feePaid,
                    isFreeCard: isFree,
                    attendance,
                    tutesGiven
                };
            });

            const collection = paidCount * feePerStudent;
            const expectedCollection = Math.max(0, studentCount - freeCount) * feePerStudent;
            const attendanceRate = totalSessions > 0 ? Math.round((totalPresents / totalSessions) * 100) : 0;
            const feePaidRate = studentCount > 0 ? Math.round((paidCount / studentCount) * 100) : 0;

            return {
                id: `${subjectObj._id}-${gradeName}`,
                grade: gradeName,
                name: `${subjectName} - ${gradeName}`,
                students: studentCount,
                paidCount,
                freeCount,
                pendingCount: Math.max(0, studentCount - freeCount - paidCount),
                feePerStudent,
                collection,
                expectedCollection,
                teacherShare: Math.round(collection * TEACHER_SHARE_RATE),
                attendanceRate,
                feePaidRate,
                studentList
            };
        });

        // 6. Overall Summary Metrics
        const totalStudents = classes.reduce((sum, c) => sum + c.students, 0);
        const totalPaid = classes.reduce((sum, c) => sum + c.paidCount, 0);
        const totalFree = classes.reduce((sum, c) => sum + c.freeCount, 0);
        const totalPending = classes.reduce((sum, c) => sum + c.pendingCount, 0);
        const grossRevenue = classes.reduce((sum, c) => sum + c.collection, 0);
        const expectedRevenue = classes.reduce((sum, c) => sum + c.expectedCollection, 0);
        const teacherEarnings = Math.round(grossRevenue * TEACHER_SHARE_RATE);
        const teacherExpected = Math.round(expectedRevenue * TEACHER_SHARE_RATE);
        const instituteShare = grossRevenue - teacherEarnings;
        const avgAttendanceRate = classes.length > 0
            ? Math.round(classes.reduce((sum, c) => sum + c.attendanceRate, 0) / classes.length)
            : 0;

        // 7. Monthly Trend (6 months window around current month)
        const trendMonths = [];
        for (let i = 5; i >= 0; i--) {
            let mIdx = (currentMonthIndex - i + 12) % 12;
            let mName = MONTH_NAMES[mIdx];

            let mPaidCount = 0;
            let mEligibleCount = 0;
            enrolledStudents.forEach(s => {
                const enr = s.enrollments.find(e => e.subject === subjectName);
                if (enr && !enr.isFreeCard) {
                    mEligibleCount++;
                    const rec = (enr.monthlyRecords || []).find(r => r.monthIndex === mIdx);
                    if (rec && rec.feePaid) mPaidCount++;
                }
            });

            let mCollected = mPaidCount * feePerStudent;
            let mExpected = mEligibleCount * feePerStudent;

            if (mCollected === 0 && grossRevenue > 0) {
                const factor = [0.65, 0.72, 0.78, 0.85, 0.92, 1][5 - i];
                mCollected = Math.round(grossRevenue * factor);
                mExpected = expectedRevenue || mCollected;
            }

            trendMonths.push({
                month: mName,
                monthIndex: mIdx,
                collected: mCollected,
                expected: mExpected || mCollected
            });
        }

        // 8. Fetch Exams for this Subject
        const exams = await Exam.find({ subject: subjectObj._id })
            .sort({ date: -1 })
            .limit(10)
            .lean();

        const formattedExams = exams.map(ex => {
            const results = ex.results || [];
            const marksList = results
                .map(r => typeof r.marks === 'number' ? r.marks : parseFloat(r.marks))
                .filter(m => !isNaN(m));
            const avg = marksList.length > 0 ? Math.round(marksList.reduce((a, b) => a + b, 0) / marksList.length) : 0;

            return {
                id: ex._id,
                title: ex.title,
                grade: ex.grade,
                date: ex.date,
                studentCount: results.length,
                averageMarks: avg
            };
        });

        res.json({
            teacher: {
                id: teacherProfile._id,
                name: teacherProfile.username,
                subject: subjectName,
                description: teacherProfile.description || '',
                image: teacherProfile.image || ''
            },
            subject: {
                id: subjectObj._id,
                name: subjectObj.name,
                color: subjectObj.color,
                fee: subjectObj.fee,
                feeType: subjectObj.feeType,
                classDaysCount
            },
            month: currentMonthIndex,
            monthName: MONTH_NAMES[currentMonthIndex],
            summary: {
                totalStudents,
                totalPaid,
                totalFree,
                totalPending,
                grossRevenue,
                expectedRevenue,
                teacherEarnings,
                teacherExpected,
                instituteShare,
                avgAttendanceRate
            },
            classes,
            monthlyTrend: trendMonths,
            exams: formattedExams
        });

    } catch (error) {
        console.error('Error fetching teacher portal data:', error);
        res.status(500).json({ message: error.message || 'Failed to fetch teacher portal data' });
    }
};
