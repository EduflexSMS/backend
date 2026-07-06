const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

router.post('/students', studentController.createStudent);
router.get('/students/grades', studentController.getGrades);
router.get('/students', studentController.getStudents);
router.put('/students/:id', studentController.updateStudent);
router.delete('/students/:id', studentController.deleteStudent);
router.patch('/attendance/:studentId/:subject/:month/:week', studentController.markAttendance);
router.patch('/records/:studentId/:subject/:month/:type', studentController.updateRecordStatus);
router.patch('/records/:studentId/:subject/:month/daily-fee/:weekIndex', studentController.toggleDailyFeeStatus);
router.post('/attendance/qr', studentController.markAttendanceQR);


router.get('/reports/class-report', studentController.getClassReport);
router.get('/reports/grade-report', studentController.getGradeReport);
router.get('/reports/daily', studentController.getDailyReport);
router.get('/reports/monthly', studentController.getMonthlyReport);

module.exports = router;
