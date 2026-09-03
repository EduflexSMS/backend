const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const Subject = require('../models/Subject');
const Student = require('../models/Student');
// No auth middleware used as per other routes

// Helper to determine grade based on marks
const calculateGrade = (marks) => {
    if (marks === 'AB' || marks === 'Absent') return 'AB';
    const num = Number(marks);
    if (num >= 75) return 'A';
    if (num >= 65) return 'B';
    if (num >= 55) return 'C';
    if (num >= 40) return 'S';
    return 'F';
};

router.post('/exams', async (req, res) => {
    try {
        const { title, grade, subject, date } = req.body;
        if (!title || !grade || !subject) {
            return res.status(400).json({ error: 'Title, grade, and subject are required' });
        }
        
        const newExam = new Exam({ title, grade, subject, date: date || Date.now() });
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

// Get specific exam with student details
router.get('/exams/:id', async (req, res) => {
    try {
        const exam = await Exam.findById(req.params.id)
            .populate('subject', 'name')
            .populate('results.student', 'name rfid uiid indexNumber grade mobile parentMobile');
        
        if (!exam) return res.status(404).json({ error: 'Exam not found' });
        res.json(exam);
    } catch (error) {
        console.error('Error fetching exam:', error);
        res.status(500).json({ error: 'Failed to fetch exam details' });
    }
});

router.put('/exams/:id/marks', async (req, res) => {
    try {
        const { studentId, marks } = req.body;
        const examId = req.params.id;

        let finalMarks;
        let grade;

        if (marks === 'AB' || marks === 'Absent') {
            finalMarks = 'AB';
            grade = 'AB';
        } else {
            const numMarks = Number(marks);
            if (isNaN(numMarks) || numMarks < 0 || numMarks > 100) {
                return res.status(400).json({ error: 'Marks must be between 0 and 100 or AB' });
            }
            finalMarks = numMarks;
            grade = calculateGrade(numMarks);
        }

        const exam = await Exam.findById(examId);
        
        if (!exam) return res.status(404).json({ error: 'Exam not found' });

        // Check if student result already exists
        const existingResultIndex = exam.results.findIndex(r => r.student.toString() === studentId);
        
        if (existingResultIndex >= 0) {
            exam.results[existingResultIndex].marks = finalMarks;
            exam.results[existingResultIndex].grade = grade;
        } else {
            exam.results.push({ student: studentId, marks: finalMarks, grade });
        }

        await exam.save();
        
        // Re-populate to return the updated data
        const updatedExam = await Exam.findById(examId)
            .populate('subject', 'name')
            .populate('results.student', 'name rfid uiid indexNumber grade mobile parentMobile');

        res.json(updatedExam);
    } catch (error) {
        console.error('Error updating marks:', error);
        res.status(500).json({ error: 'Failed to update marks' });
    }
});

// Update exam details (title, date, grade, subject)
router.put('/exams/:id', async (req, res) => {
    try {
        const { title, date, grade, subject } = req.body;
        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (date !== undefined) updateData.date = date;
        if (grade !== undefined) updateData.grade = grade;
        if (subject !== undefined) updateData.subject = subject;

        const updatedExam = await Exam.findByIdAndUpdate(req.params.id, updateData, { new: true })
            .populate('subject', 'name')
            .populate('results.student', 'name rfid uiid indexNumber grade mobile parentMobile');

        if (!updatedExam) return res.status(404).json({ error: 'Exam not found' });
        res.json(updatedExam);
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
