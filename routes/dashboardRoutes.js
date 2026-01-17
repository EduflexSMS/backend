const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

router.get('/dashboard/stats', dashboardController.getDashboardStats);
router.get('/dashboard/subject/:subjectName', dashboardController.getSubjectDetails);

module.exports = router;
