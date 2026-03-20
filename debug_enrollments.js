const mongoose = require('mongoose');
const Student = require('./models/Student');
require('dotenv').config();

const checkEnrollments = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        // Find students with the old subject name
        const oldSubject = "Business & Accounting Studies";
        const students = await Student.find({ "enrollments.subject": oldSubject });

        console.log(`Found ${students.length} students enrolled in '${oldSubject}'`);

        students.forEach(s => {
            console.log(`- ${s.name} (${s.indexNumber})`);
        });

        if (students.length > 0) {
            console.log("\nSample Enrollment for first student:");
            const enroll = students[0].enrollments.find(e => e.subject === oldSubject);
            console.log(JSON.stringify(enroll, null, 2));
        }

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

checkEnrollments();
