const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

router.post('/students', studentController.createStudent);
router.get('/students', studentController.getStudents);
router.put('/students/:id', studentController.updateStudent);
router.patch('/attendance/:studentId/:subject/:month/:week', studentController.markAttendance);
router.patch('/records/:studentId/:subject/:month/:type', studentController.updateRecordStatus);


router.get('/reports/class-report', studentController.getClassReport);
router.get('/reports/monthly', studentController.getMonthlyReport);

module.exports = router;
