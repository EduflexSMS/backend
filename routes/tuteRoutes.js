const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Transaction = require('../models/Transaction');
const { sendSMS } = require('../utils/smsHelper');

// Helper to check if subject name matches Mathematics
function isMathSubject(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return lower.includes('math') || lower.includes('ගණිත') || lower.includes('ganitha');
}

// Helper to check if grade is between 6 and 11
function isGrade6To11(gradeStr) {
    if (!gradeStr) return false;
    const num = parseInt(gradeStr.replace(/\D/g, ''), 10);
    return num >= 6 && num <= 11;
}

// GET /api/tutes/students
// Fetch all students in Grades 6-11 taking Mathematics, along with their Term 1, 2, 3 tutes
router.get('/students', async (req, res) => {
    try {
        const { grade, search } = req.query;

        const filter = {};
        if (grade && grade !== 'all') {
            filter.grade = grade;
        }

        if (search && search.trim()) {
            const s = search.trim();
            filter.$or = [
                { name: { $regex: s, $options: 'i' } },
                { indexNumber: { $regex: s, $options: 'i' } },
                { mobile: { $regex: s, $options: 'i' } }
            ];
        }

        const allStudents = await Student.find(filter).sort({ indexNumber: 1 });

        // Filter for Mathematics enrollment and Grade 6-11 (unless a specific grade is requested)
        const mathStudents = allStudents.filter(stu => {
            const hasMath = stu.enrollments.some(e => isMathSubject(e.subject));
            const validGrade = grade && grade !== 'all' ? true : isGrade6To11(stu.grade);
            return hasMath && validGrade;
        });

        // Ensure termTutes (Terms 1, 2, 3) are populated on each student response
        const studentsWithTutes = mathStudents.map(stu => {
            const studentObj = stu.toObject();
            const mathEnrollment = studentObj.enrollments.find(e => isMathSubject(e.subject));

            const existingTutes = (mathEnrollment && mathEnrollment.termTutes) || [];
            
            // Build standardized 3 terms
            const terms = [1, 2, 3].map(termNum => {
                const found = existingTutes.find(t => t.term === termNum);
                return found || {
                    term: termNum,
                    termName: `Term ${termNum}`,
                    fee: 400,
                    paid: false,
                    issued: false,
                    issuedDate: null,
                    transactionId: null
                };
            });

            return {
                _id: studentObj._id,
                name: studentObj.name,
                grade: studentObj.grade,
                mobile: studentObj.mobile,
                indexNumber: studentObj.indexNumber,
                mathSubject: mathEnrollment ? mathEnrollment.subject : 'Mathematics',
                terms
            };
        });

        // Calculate summary metrics
        let totalIssuedTerm1 = 0;
        let totalIssuedTerm2 = 0;
        let totalIssuedTerm3 = 0;
        let totalRevenue = 0;

        studentsWithTutes.forEach(s => {
            s.terms.forEach(t => {
                if (t.issued) {
                    if (t.term === 1) totalIssuedTerm1++;
                    if (t.term === 2) totalIssuedTerm2++;
                    if (t.term === 3) totalIssuedTerm3++;
                    totalRevenue += (t.fee || 400);
                }
            });
        });

        res.json({
            success: true,
            totalStudents: studentsWithTutes.length,
            stats: {
                totalIssuedTerm1,
                totalIssuedTerm2,
                totalIssuedTerm3,
                totalRevenue
            },
            students: studentsWithTutes
        });

    } catch (err) {
        console.error('[Tute Routes] Error fetching students:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/tutes/issue
// Issue a Term Tute (Rs. 400) and dispatch Hutch SIM SMS
router.post('/issue', async (req, res) => {
    try {
        const { studentId, term, subject, fee = 400, language = 'si' } = req.body;

        if (!studentId || !term) {
            return res.status(400).json({ success: false, message: 'studentId and term are required' });
        }

        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // Find Mathematics enrollment
        let enrollment = student.enrollments.find(e => subject ? e.subject === subject : isMathSubject(e.subject));
        if (!enrollment) {
            // If not found by specific match, pick first math subject or first enrollment
            enrollment = student.enrollments.find(e => isMathSubject(e.subject)) || student.enrollments[0];
        }

        if (!enrollment) {
            return res.status(400).json({ success: false, message: 'Student is not enrolled in Mathematics' });
        }

        // Initialize termTutes if not exists
        if (!enrollment.termTutes) {
            enrollment.termTutes = [];
        }

        let tuteRecord = enrollment.termTutes.find(t => t.term === parseInt(term, 10));
        const transactionId = 'TXN-TUTE-' + Date.now().toString().slice(-6) + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

        if (tuteRecord) {
            tuteRecord.paid = true;
            tuteRecord.issued = true;
            tuteRecord.fee = fee;
            tuteRecord.issuedDate = new Date();
            tuteRecord.transactionId = transactionId;
        } else {
            enrollment.termTutes.push({
                term: parseInt(term, 10),
                termName: `Term ${term}`,
                fee,
                paid: true,
                issued: true,
                issuedDate: new Date(),
                transactionId
            });
        }

        student.markModified('enrollments');
        await student.save();

        // Create transaction record for audit/reports
        const transaction = new Transaction({
            transactionId,
            studentId: student._id,
            studentName: student.name,
            indexNumber: student.indexNumber,
            items: [{
                itemType: 'tute',
                subject: enrollment.subject,
                term: parseInt(term, 10),
                termName: `Term ${term} Tute`,
                amount: fee
            }],
            totalAmount: fee
        });
        await transaction.save();

        // Compose Hutch SIM SMS and WhatsApp messages
        const dateStr = new Date().toLocaleDateString('en-GB');
        const termNameSi = parseInt(term, 10) === 1 ? '1 වන වාරය (Term 1)' : parseInt(term, 10) === 2 ? '2 වන වාරය (Term 2)' : '3 වන වාරය (Term 3)';

        const smsMessage = language === 'si'
            ? `Eduflex Tute Receipt:\nසිසුවා: ${student.name} (${student.indexNumber})\nවිෂය: ${enrollment.subject} (${student.grade})\nවාරය: ${termNameSi} Tute\nගාස්තුව: රු. ${fee}.00\nලදුපත් අංකය: ${transactionId}\nදිනය: ${dateStr}\nටියුට් එක සාර්ථකව නිකුත් කරන ලදී.\nස්තූතියි! Eduflex Institute`
            : `Eduflex Tute Receipt:\nStudent: ${student.name} (${student.indexNumber})\nSubject: ${enrollment.subject} (${student.grade})\nTerm: Term ${term} Tute\nFee: Rs. ${fee}.00\nReceipt: ${transactionId}\nDate: ${dateStr}\nTute issued successfully.\nThank you! Eduflex Institute`;

        const waMessage = `✅ *Tute Payment Receipt - Eduflex*\n---------------------------------\n` +
            `*සිසුවා:* ${student.name}\n` +
            `*Index:* ${student.indexNumber}\n` +
            `*විෂය:* ${enrollment.subject} (${student.grade})\n` +
            `*වාරය:* ${termNameSi} Tute\n` +
            `*ගාස්තුව:* රු. ${fee}.00\n` +
            `*ලදුපත් අංකය:* ${transactionId}\n` +
            `*දිනය:* ${dateStr}\n---------------------------------\n` +
            `ටියුට් එක සාර්ථකව නිකුත් කරන ලදී.\nස්තූතියි!\nEduflex Institute`;

        // Dispatch Hutch SIM Gateway SMS
        let smsResult = { success: false, status: 'skipped' };
        if (student.mobile) {
            try {
                smsResult = await sendSMS(student.mobile, smsMessage);
            } catch (smsErr) {
                console.error('[Tute Routes] SMS dispatch error:', smsErr.message);
                smsResult = { success: false, status: 'failed', error: smsErr.message };
            }
        }

        res.json({
            success: true,
            message: `Term ${term} Tute issued successfully!`,
            studentId: student._id,
            term: parseInt(term, 10),
            transactionId,
            smsResult,
            smsMessage,
            waMessage,
            studentMobile: student.mobile
        });

    } catch (err) {
        console.error('[Tute Routes] Error issuing tute:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/tutes/toggle
// Toggle status back to pending if marked erroneously
router.post('/toggle', async (req, res) => {
    try {
        const { studentId, term, subject } = req.body;

        const student = await Student.findById(studentId);
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        const enrollment = student.enrollments.find(e => subject ? e.subject === subject : isMathSubject(e.subject));
        if (!enrollment || !enrollment.termTutes) {
            return res.status(400).json({ success: false, message: 'No term tutes found' });
        }

        const tuteRecord = enrollment.termTutes.find(t => t.term === parseInt(term, 10));
        if (tuteRecord) {
            tuteRecord.issued = !tuteRecord.issued;
            tuteRecord.paid = tuteRecord.issued;
            tuteRecord.issuedDate = tuteRecord.issued ? new Date() : null;
        }

        student.markModified('enrollments');
        await student.save();

        res.json({
            success: true,
            message: 'Tute status updated',
            tuteRecord
        });

    } catch (err) {
        console.error('[Tute Routes] Error toggling tute:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/tutes/resend-sms
// Re-send Hutch SIM SMS for an already issued tute
router.post('/resend-sms', async (req, res) => {
    try {
        const { studentId, term, subject, language = 'si' } = req.body;

        const student = await Student.findById(studentId);
        if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

        const enrollment = student.enrollments.find(e => subject ? e.subject === subject : isMathSubject(e.subject));
        const tuteRecord = enrollment?.termTutes?.find(t => t.term === parseInt(term, 10));

        const fee = tuteRecord?.fee || 400;
        const transactionId = tuteRecord?.transactionId || 'TXN-TUTE-CONFIRMED';
        const dateStr = tuteRecord?.issuedDate ? new Date(tuteRecord.issuedDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
        const termNameSi = parseInt(term, 10) === 1 ? '1 වන වාරය (Term 1)' : parseInt(term, 10) === 2 ? '2 වන වාරය (Term 2)' : '3 වන වාරය (Term 3)';

        const smsMessage = language === 'si'
            ? `Eduflex Tute Receipt:\nසිසුවා: ${student.name} (${student.indexNumber})\nවිෂය: ${enrollment?.subject || 'Mathematics'} (${student.grade})\nවාරය: ${termNameSi} Tute\nගාස්තුව: රු. ${fee}.00\nලදුපත් අංකය: ${transactionId}\nදිනය: ${dateStr}\nටියුට් එක සාර්ථකව නිකුත් කරන ලදී.\nස්තූතියි! Eduflex Institute`
            : `Eduflex Tute Receipt:\nStudent: ${student.name} (${student.indexNumber})\nSubject: ${enrollment?.subject || 'Mathematics'} (${student.grade})\nTerm: Term ${term} Tute\nFee: Rs. ${fee}.00\nReceipt: ${transactionId}\nDate: ${dateStr}\nTute issued successfully.\nThank you! Eduflex Institute`;

        let smsResult = { success: false };
        if (student.mobile) {
            smsResult = await sendSMS(student.mobile, smsMessage);
        }

        res.json({
            success: true,
            message: 'SMS sent to ' + student.mobile,
            smsResult,
            smsMessage
        });

    } catch (err) {
        console.error('[Tute Routes] Error resending SMS:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
