const express = require('express');
const router = express.Router();
const subjectController = require('../controllers/subjectController');

router.get('/subjects', subjectController.getAllSubjects);
router.post('/subjects', subjectController.createSubject);

module.exports = router;
