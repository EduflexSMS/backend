const mongoose = require('mongoose');
const Student = require('./models/Student');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/tuition-db';

console.log('Attempting to connect to:', MONGODB_URI);

mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB successfully.');
        try {
            const newStudent = new Student({
                name: 'Test Student',
                address: 'Test Address',
                school: 'Test School',
                mobile: '1234567890',
                birthday: new Date(),
                indexNumber: 'TEST-' + Date.now(),
                enrollments: []
            });
            await newStudent.save();
            console.log('Successfully saved a test student.');
            console.log('Fetching students...');
            const students = await Student.find();
            console.log('Found students:', students.length);
            process.exit(0);
        } catch (err) {
            console.error('Error performing DB operations:', err);
            process.exit(1);
        }
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });
