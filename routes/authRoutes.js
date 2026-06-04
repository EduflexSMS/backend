const express = require('express');
const router = express.Router();
const { loginUser, registerUser, createTeacher, getTeachers, seedTeachers, updateTeacher, deleteTeacher } = require('../controllers/authController');

router.get('/seed-teachers', seedTeachers);

router.post('/login', loginUser);
router.post('/register', registerUser);
router.post('/create-teacher', createTeacher);
router.get('/teachers', getTeachers);
router.put('/teachers/:id', updateTeacher);
router.delete('/teachers/:id', deleteTeacher);

module.exports = router;
