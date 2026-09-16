const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Exam = require('../models/Exam');

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

        // 2. Load subjects map
        const subjects = await Subject.find().lean();
        const subjectMap = {};
        subjects.forEach(s => { subjectMap[s.name] = s; });

        const currentMonthIndex = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        // 3. Process enrollment details
        let totalSessionsCount = 0;
        let totalAttendedCount = 0;

        const processedEnrollments = (student.enrollments || []).map(enrollment => {
            const subInfo = subjectMap[enrollment.subject] || {};
            const fee = subInfo.fee || 0;
            const feeType = subInfo.feeType || 'monthly';

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

            return {
                subject: enrollment.subject,
                isFreeCard: Boolean(enrollment.isFreeCard),
                fee,
                feeType,
                attendancePct: subPct,
                totalAttended: subAttended,
                totalSessions: subSessions,
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
                gradeBadge: studentResult.grade || 'N/A',
                rank: rank,
                totalStudents: validResults.length
            });
        }

        const overallAttendancePct = totalSessionsCount > 0 ? Math.round((totalAttendedCount / totalSessionsCount) * 100) : 100;

        res.json({
            student: {
                name: student.name,
                indexNumber: student.indexNumber,
                grade: student.grade,
                mobile: student.mobile,
                overallAttendancePct,
                totalAttendedCount,
                totalSessionsCount
            },
            enrollments: processedEnrollments,
            exams: examResults.sort((a, b) => new Date(b.date) - new Date(a.date))
        });

    } catch (error) {
        console.error('[Portal Route] Error:', error);
        res.status(500).json({ error: 'Failed to retrieve portal information', details: error.message });
    }
});

module.exports = router;
