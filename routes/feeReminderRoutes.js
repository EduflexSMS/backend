const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const { sendSMS } = require('../utils/smsHelper');

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_NAMES_SINHALA = ["ජනවාරි", "පෙබරවාරි", "මාර්තු", "අප්‍රේල්", "මැයි", "ජූනි", "ජූලි", "අගෝස්තු", "සැප්තැම්බර්", "ඔක්තෝබර්", "නොවැම්බර්", "දෙසැම්බර්"];

// GET /api/fees/unpaid
// Query students with pending fees for a specific month (and optional subject/grade)
router.get('/unpaid', async (req, res) => {
    try {
        const { month, subject, grade, year } = req.query;
        const targetMonth = month !== undefined && month !== '' ? parseInt(month) : new Date().getMonth();
        const targetYear = year !== undefined && year !== '' ? parseInt(year) : new Date().getFullYear();

        // 1. Fetch subjects map for fee info
        const subjects = await Subject.find().lean();
        const subjectMap = {};
        subjects.forEach(s => { subjectMap[s.name] = s; });

        // 2. Build Student query
        let query = {};
        if (grade) {
            query.grade = { $regex: new RegExp(`^${grade.trim()}$`, 'i') };
        }

        const students = await Student.find(query).lean();
        const unpaidList = [];

        for (const student of students) {
            const unpaidSubjects = [];
            let totalDue = 0;

            for (const enrollment of (student.enrollments || [])) {
                // Skip free cards
                if (enrollment.isFreeCard) continue;

                // Filter by subject if specified (case-insensitive & trimmed)
                if (subject && enrollment.subject.trim().toLowerCase() !== subject.trim().toLowerCase()) continue;

                // Check Enrollment Date: Skip if student/subject was enrolled AFTER the target month
                const enrollDate = Student.getEnrollmentDate(enrollment, student);
                const enrollYear = enrollDate.getFullYear();
                const enrollMonth = enrollDate.getMonth();

                // If enrolled in a future year, or same year but later month -> skip!
                if (enrollYear > targetYear) continue;
                if (enrollYear === targetYear && targetMonth < enrollMonth) continue;

                const subInfo = subjectMap[enrollment.subject];
                const feeAmount = (subInfo && subInfo.fee) ? subInfo.fee : 1000;
                const isDaily = subInfo && subInfo.feeType === 'daily';

                const record = (enrollment.monthlyRecords || []).find(r => r.monthIndex === targetMonth);

                if (isDaily) {
                    if (record) {
                        const attendedDays = (record.attendance || []).filter(a => a === 'present' || a === true || a === 'true').length;
                        const paidDays = (record.dailyFeesPaid || []).filter(p => Boolean(p)).length;
                        if (attendedDays > paidDays) {
                            const dueForSubject = (attendedDays - paidDays) * feeAmount;
                            unpaidSubjects.push({
                                subject: enrollment.subject,
                                fee: dueForSubject,
                                feeType: 'daily',
                                daysDue: attendedDays - paidDays
                            });
                            totalDue += dueForSubject;
                        }
                    }
                } else {
                    const isPaid = record ? Boolean(record.feePaid) : false;
                    if (!isPaid) {
                        unpaidSubjects.push({
                            subject: enrollment.subject,
                            fee: feeAmount,
                            feeType: 'monthly'
                        });
                        totalDue += feeAmount;
                    }
                }
            }

            if (unpaidSubjects.length > 0) {
                unpaidList.push({
                    _id: student._id,
                    name: student.name,
                    indexNumber: student.indexNumber,
                    grade: student.grade,
                    mobile: student.mobile,
                    unpaidSubjects,
                    totalDue,
                    monthIndex: targetMonth,
                    monthName: MONTH_NAMES[targetMonth],
                    monthNameSi: MONTH_NAMES_SINHALA[targetMonth]
                });
            }
        }

        res.json({
            count: unpaidList.length,
            monthIndex: targetMonth,
            monthName: MONTH_NAMES[targetMonth],
            students: unpaidList
        });

    } catch (error) {
        console.error('[Fee Reminders] Error fetching unpaid list:', error);
        res.status(500).json({ error: 'Failed to fetch unpaid students', details: error.message });
    }
});

// POST /api/fees/send-reminders
// Batch dispatch SMS reminders to selected students
router.post('/send-reminders', async (req, res) => {
    try {
        const { reminders } = req.body; // Array of { studentId, mobile, message }

        if (!Array.isArray(reminders) || reminders.length === 0) {
            return res.status(400).json({ error: 'No reminders provided to send.' });
        }

        const results = [];
        let sentCount = 0;
        let failedCount = 0;

        // Process sequentially with small delay (200ms) to ensure phone gateway is not overwhelmed
        for (const item of reminders) {
            const { mobile, message, studentName } = item;
            if (!mobile || !message) {
                results.push({ studentName, mobile, status: 'skipped', error: 'Missing mobile or message' });
                continue;
            }

            try {
                const sendResult = await sendSMS(mobile, message);
                if (sendResult.success) {
                    sentCount++;
                    results.push({ studentName, mobile, status: 'sent' });
                } else {
                    failedCount++;
                    results.push({ studentName, mobile, status: 'failed', error: sendResult.error });
                }
            } catch (err) {
                failedCount++;
                results.push({ studentName, mobile, status: 'failed', error: err.message });
            }

            // Small delay between calls
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        res.json({
            total: reminders.length,
            sent: sentCount,
            failed: failedCount,
            results
        });

    } catch (error) {
        console.error('[Fee Reminders] Error in batch send:', error);
        res.status(500).json({ error: 'Failed to send batch fee reminders', details: error.message });
    }
});

module.exports = router;
