const Student = require('../models/Student');
const Subject = require('../models/Subject');
const User = require('../models/User');

exports.getDashboardStats = async (req, res) => {
    try {
        const totalStudents = await Student.countDocuments();
        const totalSubjects = await Subject.countDocuments();
        const totalTeachers = await User.countDocuments({ role: 'teacher' });

        const currentDate = new Date();
        const currentMonthIndex = currentDate.getMonth();

        const subjects = await Subject.find({});
        const students = await Student.find({});

        const subjectStatsMap = {};
        subjects.forEach(sub => {
            subjectStatsMap[sub.name] = {
                subject: sub.name,
                studentCount: 0,
                paidFees: 0,
                activeAttendance: 0
            };
        });

        students.forEach(student => {
            student.enrollments.forEach(enrollment => {
                const subStat = subjectStatsMap[enrollment.subject];
                if (!subStat) return; // Ignore if subject doesn't exist anymore

                subStat.studentCount++;

                const record = enrollment.monthlyRecords.find(r => r.monthIndex === currentMonthIndex);
                if (record) {
                    // Check active attendance (at least one day present/true)
                    const isAttended = record.attendance && record.attendance.some(a => a === 'present' || a === true || a === 'true');
                    if (isAttended) {
                        subStat.activeAttendance++;
                    }

                    // Check paid fees
                    const subjectObj = subjects.find(s => s.name === enrollment.subject);
                    const isDailyFee = subjectObj && subjectObj.feeType === 'daily';
                    
                    if (enrollment.isFreeCard) {
                        // Free card student
                    } else if (isDailyFee) {
                        const paidDays = record.dailyFeesPaid ? record.dailyFeesPaid.filter(Boolean).length : 0;
                        const classDaysCount = subjectObj?.classDaysCount || 5;
                        subStat.paidFees += (paidDays / classDaysCount);
                    } else {
                        if (record.feePaid) {
                            subStat.paidFees++;
                        }
                    }
                }
            });
        });

        // Round paidFees to nearest integer for presentation
        const formattedSubjectStats = Object.values(subjectStatsMap).map(stat => ({
            ...stat,
            paidFees: Math.round(stat.paidFees)
        }));

        res.json({
            totalStudents,
            totalSubjects,
            teacherCount: totalTeachers,
            subjectStats: formattedSubjectStats
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getSubjectDetails = async (req, res) => {
    try {
        const { subjectName } = req.params;
        const currentDate = new Date();
        let currentMonthIndex = req.query.month ? parseInt(req.query.month) : currentDate.getMonth();

        const subjectObj = await Subject.findOne({ name: subjectName });
        const isDailyFee = subjectObj && subjectObj.feeType === 'daily';
        const fee = subjectObj ? subjectObj.fee : 0;

        const students = await Student.find({ "enrollments.subject": subjectName });

        // Group by grade
        const gradeMap = {};

        students.forEach(student => {
            const enrollment = student.enrollments.find(e => e.subject === subjectName);
            if (!enrollment) return;

            const record = enrollment.monthlyRecords.find(r => r.monthIndex === currentMonthIndex);
            
            const grade = student.grade;
            if (!gradeMap[grade]) {
                gradeMap[grade] = {
                    grade,
                    totalStudents: 0,
                    paidStudents: 0,
                    collectedAmount: 0
                };
            }

            gradeMap[grade].totalStudents++;

            if (enrollment.isFreeCard) {
                return;
            }

            if (isDailyFee) {
                const paidDays = (record && record.dailyFeesPaid) ? record.dailyFeesPaid.filter(Boolean).length : 0;
                gradeMap[grade].collectedAmount += paidDays * fee;
                gradeMap[grade].paidStudents += paidDays;
            } else {
                if (record && record.feePaid) {
                    gradeMap[grade].paidStudents++;
                    gradeMap[grade].collectedAmount += fee;
                }
            }
        });

        const formattedStats = Object.values(gradeMap).sort((a, b) => a.grade.localeCompare(b.grade));

        res.json(formattedStats);
    } catch (error) {
        console.error("Error fetching subject details:", error);
        res.status(500).json({ message: error.message });
    }
};
