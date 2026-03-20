const mongoose = require('mongoose');
const Student = require('./models/Student');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/eduflex');
    console.log('Connected to DB');

    try {
        const students = await Student.find({}, 'name grade enrollments.subject indexNumber');
        console.log(`Found ${students.length} students.`);

        students.slice(0, 5).forEach(s => {
            console.log(`- Name: ${s.name}, Grade: '${s.grade}', Index: ${s.indexNumber}`);
            if (s.enrollments && s.enrollments.length > 0) {
                console.log(`  Subjects: ${s.enrollments.map(e => `'${e.subject}'`).join(', ')}`);
            }
        });

        // Check for "Grade 6" vs "Grade 06"
        const grade6 = await Student.countDocuments({ grade: 'Grade 6' });
        const grade06 = await Student.countDocuments({ grade: 'Grade 06' });
        console.log(`\nStats: 'Grade 6': ${grade6}, 'Grade 06': ${grade06}`);

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
