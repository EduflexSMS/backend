const mongoose = require('mongoose');
const Subject = require('./models/Subject');
const Student = require('./models/Student');
require('dotenv').config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Get a student
        const student = await Student.findOne();
        if (!student) {
            console.log('No students found to test.');
            process.exit();
        }

        console.log(`Testing with student: ${student.name} (${student._id})`);

        if (!student.enrollments || student.enrollments.length === 0) {
            console.log('Student has no enrollments.');
            process.exit();
        }

        const subject = student.enrollments[0].subject; // e.g., 'Mathematics'
        const month = 0; // January
        const type = 'fee';

        console.log(`Attempting to toggle fee for Subject: ${subject}, Month: ${month}`);

        // 2. Call the API
        const url = `http://localhost:5000/api/records/${student._id}/${subject}/${month}/${type}`;
        console.log(`URL: ${url}`);

        try {
            const res = await fetch(url, { method: 'PATCH' });
            if (res.ok) {
                const data = await res.json();
                console.log('Success! Updated Student:', data.name);
            } else {
                console.error('API Call Failed!');
                console.error('Status:', res.status);
                const text = await res.text();
                console.error('Body:', text);
            }
        } catch (apiErr) {
            console.error('Fetch Error:', apiErr.message);
        }

        process.exit();
    } catch (err) {
        console.error('Script Error:', err);
        process.exit(1);
    }
};

run();
