const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Exam = require('../models/Exam');
const User = require('../models/User');

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_NAMES_SINHALA = ["ජනවාරි", "පෙබරවාරි", "මාර්තු", "අප්‍රේල්", "මැයි", "ජූනි", "ජූලි", "අගෝස්තු", "සැප්තැම්බර්", "ඔක්තෝබර්", "නොවැම්බර්", "දෙසැම්බර්"];

// GET /api/portal/student/:identifier
// Public sanitized student profile for parents and students (by indexNumber or mobile)
router.get('/student/:identifier', async (req, res) => {
    try {
        const { identifier } = req.params;
        if (!identifier) {
            return res.status(400).json({ error: 'Student Index Number or Mobile is required' });
        }

        const cleanId = identifier.trim();

        // 1. Find Student
        const student = await Student.findOne({
            $or: [
                { indexNumber: { $regex: new RegExp(`^${cleanId}$`, 'i') } },
                { mobile: cleanId.replace(/[^\d]/g, '') },
                { mobile: cleanId }
            ]
        }).lean();

        if (!student) {
            return res.status(404).json({ error: 'No student found with this Index Number or Mobile Number.' });
        }

        // 2. Load subjects and teachers map
        const subjects = await Subject.find().lean();
        const subjectMap = {};
        subjects.forEach(s => { subjectMap[s.name] = s; });

        const teachers = await User.find({ role: 'teacher' }).select('username name assignedSubject image description').lean();
        const teacherMap = {};
        teachers.forEach(t => {
            if (t.assignedSubject) {
                teacherMap[t.assignedSubject] = t;
            }
        });

        const currentMonthIndex = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        // 3. Process enrollment details
        let totalSessionsCount = 0;
        let totalAttendedCount = 0;

        const processedEnrollments = (student.enrollments || []).map(enrollment => {
            const subInfo = subjectMap[enrollment.subject] || {};
            const fee = subInfo.fee || 0;
            const feeType = subInfo.feeType || 'monthly';
            const teacher = teacherMap[enrollment.subject];

            // Resolve timetable / day
            const gradeSchedule = (subInfo.gradeSchedules || []).find(g => g.grade === student.grade);
            const classDay = gradeSchedule ? gradeSchedule.day : (subInfo.classDay || 'Weekly');

            const enrollDate = Student.getEnrollmentDate(enrollment, student);
            const enrollYear = enrollDate.getFullYear();
            const enrollMonth = enrollDate.getMonth();

            let subSessions = 0;
            let subAttended = 0;

            const monthsData = (enrollment.monthlyRecords || []).map(rec => {
                const attendedDays = (rec.attendance || []).filter(a => a === 'present' || a === true || a === 'true').length;
                const totalDays = (rec.attendance || []).filter(a => a !== 'pending').length;

                const notEnrolled = enrollYear > currentYear || (enrollYear === currentYear && rec.monthIndex < enrollMonth);

                if (!notEnrolled) {
                    subSessions += totalDays;
                    subAttended += attendedDays;
                }

                let isPaid = false;
                if (notEnrolled) {
                    isPaid = false;
                } else if (enrollment.isFreeCard) {
                    isPaid = true;
                } else if (feeType === 'daily') {
                    const paidDays = (rec.dailyFeesPaid || []).filter(p => Boolean(p)).length;
                    isPaid = attendedDays === 0 || paidDays >= attendedDays;
                } else {
                    isPaid = Boolean(rec.feePaid);
                }

                return {
                    monthIndex: rec.monthIndex,
                    monthName: MONTH_NAMES[rec.monthIndex],
                    monthNameSi: MONTH_NAMES_SINHALA[rec.monthIndex],
                    isCurrentMonth: rec.monthIndex === currentMonthIndex,
                    notEnrolled,
                    feePaid: isPaid,
                    feePaidDate: rec.feePaidDate,
                    feeAmount: fee,
                    feeType,
                    tutesGiven: Boolean(rec.tutesGiven),
                    attendedDays,
                    totalDays
                };
            });

            totalSessionsCount += subSessions;
            totalAttendedCount += subAttended;

            const subPct = subSessions > 0 ? Math.round((subAttended / subSessions) * 100) : 100;

            // Process Term Tutes if any
            const termTutes = (enrollment.termTutes || []).map(t => ({
                term: t.term,
                termName: t.termName || `Term ${t.term} Tute`,
                fee: t.fee,
                paid: Boolean(t.paid),
                issued: Boolean(t.issued),
                issuedDate: t.issuedDate
            }));

            return {
                subject: enrollment.subject,
                teacherName: teacher ? (teacher.name || teacher.username) : 'EduFlex Faculty',
                teacherImage: teacher ? teacher.image : null,
                teacherBio: teacher ? teacher.description : null,
                classDay: classDay,
                color: subInfo.color || '#4f46e5',
                isFreeCard: Boolean(enrollment.isFreeCard),
                fee,
                feeType,
                attendancePct: subPct,
                totalAttended: subAttended,
                totalSessions: subSessions,
                termTutes: termTutes,
                monthlyRecords: monthsData.sort((a, b) => a.monthIndex - b.monthIndex)
            };
        });

        // 4. Fetch Exam Results for this student
        const exams = await Exam.find({
            'results.student': student._id
        }).populate('subject', 'name').lean();

        const examResults = [];
        for (const exam of exams) {
            // Find student's result
            const studentResult = (exam.results || []).find(r => r.student.toString() === student._id.toString());
            if (!studentResult) continue;

            // Calculate student rank in this exam
            const validResults = (exam.results || [])
                .filter(r => r.marks !== 'AB' && r.marks !== 'Absent' && !isNaN(Number(r.marks)))
                .map(r => Number(r.marks))
                .sort((a, b) => b - a);

            let rank = 'N/A';
            if (studentResult.marks !== 'AB') {
                const numericMark = Number(studentResult.marks);
                const rankIndex = validResults.indexOf(numericMark);
                if (rankIndex >= 0) {
                    rank = rankIndex + 1;
                }
            }

            examResults.push({
                examId: exam._id,
                title: exam.title,
                grade: exam.grade,
                subject: exam.subject ? exam.subject.name : 'Unknown',
                date: exam.date,
                marks: studentResult.marks,
                totalMarks: exam.totalMarks || 100,
                gradeBadge: studentResult.grade || 'N/A',
                rank: rank,
                totalStudents: validResults.length
            });
        }

        const overallAttendancePct = totalSessionsCount > 0 ? Math.round((totalAttendedCount / totalSessionsCount) * 100) : 100;

        res.json({
            student: {
                _id: student._id,
                name: student.name,
                indexNumber: student.indexNumber,
                grade: student.grade,
                mobile: student.mobile,
                school: student.school || '',
                registeredAt: student.createdAt,
                overallAttendancePct,
                totalAttendedCount,
                totalSessionsCount
            },
            enrollments: processedEnrollments,
            exams: examResults.sort((a, b) => new Date(b.date) - new Date(a.date)),
            institute: {
                name: 'EduFlex Higher Education Institute',
                tagline: 'Excellence in Education & Student Development',
                hotline: '+94 11 234 5678 / +94 77 123 4567',
                whatsapp: '+94 77 123 4567',
                email: 'support@eduflex.lk',
                address: 'EduFlex Main Campus, High Level Road, Nugegoda',
                workingHours: 'Tuesday - Sunday: 7:30 AM - 6:30 PM'
            },
            notices: [
                {
                    id: 1,
                    title: 'Monthly Class Fees Reminder / මාසික පන්ති ගාස්තු ගෙවීම',
                    date: new Date().toISOString().split('T')[0],
                    category: 'Finance',
                    priority: 'important',
                    contentEn: 'Please ensure class fees are settled on or before the 10th of every month to guarantee uninterrupted admission and study material access.',
                    contentSi: 'නොකඩවා පන්ති සහභාගීත්වය හා නිබන්ධන (Tutes) ලබා ගැනීම තහවුරු කර ගැනීමට සෑම මසකම 10 වන දිනට පෙර මාසික පන්ති ගාස්තු ගෙවා අවසන් කරන්න.'
                },
                {
                    id: 2,
                    title: 'Upcoming Term Evaluations / වාර විභාග සහ ඇගයීම්',
                    date: new Date().toISOString().split('T')[0],
                    category: 'Academic',
                    priority: 'normal',
                    contentEn: 'Monthly revision tests will be conducted in all classes this week. Students are advised to bring their student ID cards and admission receipts.',
                    contentSi: 'මෙම සතියේ සියලුම පන්ති වල මාසික පුනරීක්ෂණ පරීක්ෂණ පැවැත්වේ. සිසුන් තම ශිෂ්‍ය හැඳුනුම්පත (QR Card) රැගෙන පැමිණිය යුතුය.'
                },
                {
                    id: 3,
                    title: 'Student ID Card & Attendance Scan / ශිෂ්‍ය හැඳුනුම්පත් භාවිතය',
                    date: new Date().toISOString().split('T')[0],
                    category: 'General',
                    priority: 'info',
                    contentEn: 'All students must scan their QR Code ID card at the gate upon entry and exit. Digital QR codes on smartphones are also accepted.',
                    contentSi: 'සියලුම සිසුන් ආයතනයට ඇතුළු වීමේදී හා පිටවීමේදී දොරටුව අසල ඇති ස්කෑනරය මඟින් තම QR හැඳුනුම්පත ස්කෑන් කළ යුතුය.'
                }
            ]
        });

    } catch (error) {
        console.error('[Portal Route] Error:', error);
        res.status(500).json({ error: 'Failed to retrieve portal information', details: error.message });
    }
});

module.exports = router;
