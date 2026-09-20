const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const Subject = require('../models/Subject');
const Student = require('../models/Student');
const { sendSMS } = require('../utils/smsHelper');

// Helper to determine grade based on marks and exam totalMarks
const calculateGrade = (marks, totalMarks = 100) => {
    if (marks === 'AB' || marks === 'Absent') return 'AB';
    const num = Number(marks);
    if (isNaN(num)) return 'F';
    const max = Number(totalMarks) > 0 ? Number(totalMarks) : 100;
    const pct = (num / max) * 100;
    if (pct >= 75) return 'A';
    if (pct >= 65) return 'B';
    if (pct >= 55) return 'C';
    if (pct >= 40) return 'S';
    return 'F';
};

// Helper to calculate student ranks
const attachRanksToExam = (examDoc) => {
    const examObj = examDoc.toObject ? examDoc.toObject() : examDoc;
    const results = examObj.results || [];

    // Extract sorted unique numeric marks
    const numericMarks = results
        .filter(r => r.marks !== 'AB' && r.marks !== 'Absent' && !isNaN(Number(r.marks)))
        .map(r => Number(r.marks))
        .sort((a, b) => b - a);

    examObj.totalRanked = numericMarks.length;

    examObj.results = results.map(r => {
        let rank = 'AB';
        if (r.marks !== 'AB' && r.marks !== 'Absent' && !isNaN(Number(r.marks))) {
            rank = numericMarks.indexOf(Number(r.marks)) + 1;
        }
        return {
            ...r,
            rank
        };
    });

    return examObj;
};

// Create new exam
router.post('/exams', async (req, res) => {
    try {
        const { title, grade, subject, date, totalMarks } = req.body;
        if (!title || !grade || !subject) {
            return res.status(400).json({ error: 'Title, grade, and subject are required' });
        }
        
        const parsedTotalMarks = Number(totalMarks) > 0 ? Number(totalMarks) : 100;
        const newExam = new Exam({
            title,
            grade,
            subject,
            totalMarks: parsedTotalMarks,
            date: date || Date.now()
        });
        const savedExam = await newExam.save();
        res.status(201).json(savedExam);
    } catch (error) {
        console.error('Error creating exam:', error);
        res.status(500).json({ error: 'Failed to create exam' });
    }
});

// Get all exams (with optional filtering)
router.get('/exams', async (req, res) => {
    try {
        const { grade, subject } = req.query;
        let query = {};
        if (grade) query.grade = grade;
        if (subject) query.subject = subject;

        const exams = await Exam.find(query)
            .populate('subject', 'name')
            .sort({ date: -1 });
        res.json(exams);
    } catch (error) {
        console.error('Error fetching exams:', error);
        res.status(500).json({ error: 'Failed to fetch exams' });
    }
});

// Get specific exam with student details & ranks
router.get('/exams/:id', async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id)
            .populate('subject', 'name')
            .populate('results.student', 'name rfid uiid indexNumber grade mobile parentMobile');
        
        if (!exam) return res.status(404).json({ error: 'Exam not found' });
        
        const rankedExam = attachRanksToExam(exam);
        res.json(rankedExam);
    } catch (error) {
        console.error('Error fetching exam:', error);
        res.status(500).json({ error: 'Failed to fetch exam details' });
    }
});

// Update or enter marks for a student
router.put('/exams/:id/marks', async (req, res) => {
    try {
        const { studentId, marks } = req.body;
        const examId = req.params.id;

        const exam = await Exam.findById(examId);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });

        const maxMarks = exam.totalMarks || 100;
        let finalMarks;
        let grade;

        if (marks === 'AB' || marks === 'Absent') {
            finalMarks = 'AB';
            grade = 'AB';
        } else {
            const numMarks = Number(marks);
            if (isNaN(numMarks) || numMarks < 0 || numMarks > maxMarks) {
                return res.status(400).json({ error: `Marks must be between 0 and ${maxMarks} or AB` });
            }
            finalMarks = numMarks;
            grade = calculateGrade(numMarks, maxMarks);
        }

        const existingResultIndex = exam.results.findIndex(r => r.student.toString() === studentId);
        
        if (existingResultIndex >= 0) {
            exam.results[existingResultIndex].marks = finalMarks;
            exam.results[existingResultIndex].grade = grade;
        } else {
            exam.results.push({ student: studentId, marks: finalMarks, grade });
        }

        await exam.save();
        
        const updatedExam = await Exam.findById(examId)
            .populate('subject', 'name')
            .populate('results.student', 'name rfid uiid indexNumber grade mobile parentMobile');

        const rankedExam = attachRanksToExam(updatedExam);
        res.json(rankedExam);
    } catch (error) {
        console.error('Error updating marks:', error);
        res.status(500).json({ error: 'Failed to update marks' });
    }
});

// Send exam results SMS to parents via Hutch SIM Gateway
router.post('/exams/:id/send-sms', async (req, res) => {
    try {
        const { studentIds, language = 'si', customMessage } = req.body;
        const exam = await Exam.findById(req.params.id)
            .populate('subject', 'name')
            .populate('results.student', 'name indexNumber mobile');

        if (!exam) return res.status(404).json({ error: 'Exam not found' });

        const rankedExam = attachRanksToExam(exam);
        const subjectName = exam.subject ? exam.subject.name : 'Class';
        const maxMarks = exam.totalMarks || 100;

        const resultsToSend = rankedExam.results.filter(r => {
            if (!r.student || !r.student.mobile) return false;
            if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
                return studentIds.includes(r.student._id.toString());
            }
            return true; // default send to all with results
        });

        if (resultsToSend.length === 0) {
            return res.status(400).json({ error: 'No students with phone numbers found to send results.' });
        }

        let sentCount = 0;
        let failedCount = 0;
        const dispatchResults = [];

        for (const item of resultsToSend) {
            const student = item.student;
            let msg = '';

            if (customMessage) {
                msg = customMessage
                    .replace(/{studentName}/g, student.name)
                    .replace(/{examTitle}/g, exam.title)
                    .replace(/{subject}/g, subjectName)
                    .replace(/{marks}/g, item.marks)
                    .replace(/{totalMarks}/g, maxMarks)
                    .replace(/{grade}/g, item.grade || '')
                    .replace(/{rank}/g, item.rank || 'N/A')
                    .replace(/{total}/g, rankedExam.totalRanked || '');
            } else if (language === 'si') {
                msg = `Eduflex විභාග ලකුණු:\n${student.name} සිසුවාගේ ${subjectName} (${exam.title}) විභාගයේ ලකුණු: ${item.marks}/${maxMarks} (ශ්‍රේණිය: ${item.grade || 'N/A'}, පන්ති ස්ථානය: #${item.rank || 'N/A'}/${rankedExam.totalRanked}). සුබ පැතුම්!`;
            } else {
                msg = `Eduflex Exam Result:\n${student.name} scored ${item.marks}/${maxMarks} (Grade: ${item.grade || 'N/A'}, Rank: #${item.rank || 'N/A'}/${rankedExam.totalRanked}) for ${subjectName} (${exam.title}). Best regards!`;
            }

            try {
                const sendRes = await sendSMS(student.mobile, msg);
                if (sendRes.success) {
                    sentCount++;
                    dispatchResults.push({ studentName: student.name, mobile: student.mobile, status: 'sent' });
                } else {
                    failedCount++;
                    dispatchResults.push({ studentName: student.name, mobile: student.mobile, status: 'failed', error: sendRes.error });
                }
            } catch (err) {
                failedCount++;
                dispatchResults.push({ studentName: student.name, mobile: student.mobile, status: 'failed', error: err.message });
            }

            await new Promise(r => setTimeout(r, 200));
        }

        res.json({
            total: resultsToSend.length,
            sent: sentCount,
            failed: failedCount,
            details: dispatchResults
        });

    } catch (error) {
        console.error('Error sending exam SMS:', error);
        res.status(500).json({ error: 'Failed to dispatch exam SMS', details: error.message });
    }
});

// Update exam details
router.put('/exams/:id', async (req, res) => {
    try {
        const { title, date, grade, subject, totalMarks } = req.body;
        const exam = await Exam.findById(req.params.id);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });

        if (title !== undefined) exam.title = title;
        if (date !== undefined) exam.date = date;
        if (grade !== undefined) exam.grade = grade;
        if (subject !== undefined) exam.subject = subject;

        let totalMarksChanged = false;
        if (totalMarks !== undefined) {
            const parsedTotal = Number(totalMarks) > 0 ? Number(totalMarks) : 100;
            if (exam.totalMarks !== parsedTotal) {
                exam.totalMarks = parsedTotal;
                totalMarksChanged = true;
            }
        }

        // If totalMarks changed, recompute grades for all existing student marks!
        if (totalMarksChanged) {
            exam.results.forEach(r => {
                if (r.marks !== 'AB' && r.marks !== 'Absent' && !isNaN(Number(r.marks))) {
                    r.grade = calculateGrade(r.marks, exam.totalMarks);
                }
            });
        }

        await exam.save();

        const updatedExam = await Exam.findById(req.params.id)
            .populate('subject', 'name')
            .populate('results.student', 'name rfid uiid indexNumber grade mobile parentMobile');

        res.json(attachRanksToExam(updatedExam));
    } catch (error) {
        console.error('Error updating exam details:', error);
        res.status(500).json({ error: 'Failed to update exam details' });
    }
});

// Delete an exam
router.delete('/exams/:id', async (req, res) => {
    try {
        const exam = await Exam.findByIdAndDelete(req.params.id);
        if (!exam) return res.status(404).json({ error: 'Exam not found' });
        res.json({ message: 'Exam deleted successfully' });
    } catch (error) {
        console.error('Error deleting exam:', error);
        res.status(500).json({ error: 'Failed to delete exam' });
    }
});

module.exports = router;
