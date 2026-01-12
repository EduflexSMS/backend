const mongoose = require('mongoose');
const Student = require('./models/Student');
// require('dotenv').config();

// MOCKING the full flow to ensure DB schema is accepting strings
async function run() {
    await mongoose.connect('mongodb://localhost:27017/eduflex'); // Hardcoded for test
    console.log('Connected to DB');

    try {
        // Find a student
        const student = await Student.findOne();
        if (!student) {
            console.log('No student found');
            return;
        }

        const subject = student.enrollments[0].subject;
        const month = 0; // Jan
        const week = 1; // Week Index 1

        console.log(`Testing on Student: ${student.name}, Subject: ${subject}`);

        // 1. Mark Absent (Simulate API Logic directly or via Controller if I could import, but DB direct is better check for Schema)
        // Let's verify Schema first by trying to save string
        const enrollment = student.enrollments.find(e => e.subject === subject);
        const record = enrollment.monthlyRecords.find(r => r.monthIndex === month);

        console.log(`Initial Status [Week ${week}]: ${record.attendance[week]}`);

        // Update to 'absent'
        record.attendance[week] = 'absent';
        student.markModified('enrollments');
        await student.save();

        // 2. Fetch back
        const updatedStudent = await Student.findById(student._id);
        const updatedRecord = updatedStudent.enrollments.find(e => e.subject === subject).monthlyRecords.find(r => r.monthIndex === month);

        console.log(`Updated Status (Expected 'absent'): ${updatedRecord.attendance[week]}`);

        if (updatedRecord.attendance[week] === 'absent') {
            console.log('SUCCESS: Schema accepted "absent" string.');
        } else {
            console.log('FAILURE: Schema did not save "absent". Value is: ' + updatedRecord.attendance[week]);
        }

        // 3. Mark Present
        updatedRecord.attendance[week] = 'present';
        updatedStudent.markModified('enrollments');
        await updatedStudent.save();
        console.log('Updated to present.');

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
