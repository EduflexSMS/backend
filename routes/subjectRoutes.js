const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');

router.get('/subjects', subjectController.getAllSubjects);
router.post('/subjects', subjectController.createSubject);
router.put('/subjects/:subjectName', subjectController.updateSubject);

module.exports = router;
