const mongoose = require('mongoose');
const Student = require('./models/Student');
require('dotenv').config();

const migrateEnrollments = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const oldSubject = "Business & Accounting Studies";
        const newSubject = "Business and Accounting Studies";

        const students = await Student.find({ "enrollments.subject": oldSubject });

        console.log(`Found ${students.length} students to migrate.`);

        for (const student of students) {
            let modified = false;
            // Check if student already has the new subject
            const hasNewHTML = student.enrollments.some(e => e.subject === newSubject);

            // Filter out old subject
            const oldEnrollment = student.enrollments.find(e => e.subject === oldSubject);

            if (oldEnrollment) {
                // Remove old enrollment
                student.enrollments = student.enrollments.filter(e => e.subject !== oldSubject);

                if (!hasNewHTML) {
                    // Rename old enrollment to new subject
                    oldEnrollment.subject = newSubject;
                    student.enrollments.push(oldEnrollment);
                    console.log(`Migrated ${student.name}`);
                } else {
                    console.log(`Removed duplicate old subject for ${student.name}`);
                }
                modified = true;
            }

            if (modified) {
                await student.save();
            }
        }

        console.log("Migration complete.");
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

migrateEnrollments();
