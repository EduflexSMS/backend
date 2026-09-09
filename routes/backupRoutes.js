const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const User = require('../models/User');
const Subject = require('../models/Subject');
const Exam = require('../models/Exam');
const TeacherPayment = require('../models/TeacherPayment');
const Setting = require('../models/Setting');
const Transaction = require('../models/Transaction');

// GET /api/backup/export
// Exports entire database to a downloadable JSON file
router.get('/export', async (req, res) => {
    try {
        const [
            students,
            users,
            subjects,
            exams,
            teacherPayments,
            settings,
            transactions
        ] = await Promise.all([
            Student.find().lean(),
            User.find().select('-password').lean(), // don't expose password hashes or keep them sanitized
            Subject.find().lean(),
            Exam.find().lean(),
            TeacherPayment.find().lean(),
            Setting.find().lean(),
            Transaction.find().lean()
        ]);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `eduflex_db_backup_${timestamp}.json`;

        const backupData = {
            system: 'Eduflex Institute Management System',
            exportedAt: new Date().toISOString(),
            version: '2.0',
            summary: {
                studentsCount: students.length,
                usersCount: users.length,
                subjectsCount: subjects.length,
                examsCount: exams.length,
                teacherPaymentsCount: teacherPayments.length,
                transactionsCount: transactions.length
            },
            data: {
                students,
                users,
                subjects,
                exams,
                teacherPayments,
                settings,
                transactions
            }
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.status(200).send(JSON.stringify(backupData, null, 2));

    } catch (error) {
        console.error('[Backup Export Error]:', error);
        res.status(500).json({ error: 'Failed to generate database backup', details: error.message });
    }
});

// GET /api/backup/summary
// Returns quick backup summary stats for the UI
router.get('/summary', async (req, res) => {
    try {
        const [studentsCount, subjectsCount, examsCount] = await Promise.all([
            Student.countDocuments(),
            Subject.countDocuments(),
            Exam.countDocuments()
        ]);

        res.json({
            studentsCount,
            subjectsCount,
            examsCount,
            lastChecked: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
