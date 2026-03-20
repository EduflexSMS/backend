const mongoose = require('mongoose');
const Student = require('./models/Student');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/eduflex');
    console.log('Connected to DB');

    try {
        const students = await Student.find({}, 'enrollments.subject');

        const subjects = new Set();
        students.forEach(s => {
            if (s.enrollments) {
                s.enrollments.forEach(e => subjects.add(e.subject));
            }
        });

        console.log("Unique Subjects found in Enrollments:");
        subjects.forEach(sub => {
            console.log(`'${sub}' (Length: ${sub.length})`);
            // Print char codes if suspicious
            if (sub.length > 20 || sub.endsWith(' ')) {
                console.log(`   -> Hex: ${Buffer.from(sub).toString('hex')}`);
            }
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
