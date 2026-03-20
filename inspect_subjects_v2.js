
const mongoose = require('mongoose');
const Subject = require('./models/Subject');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('MongoDB Connection Error:', err);
        process.exit(1);
    }
};

const inspectSubjects = async () => {
    await connectDB();
    try {
        const subjects = await Subject.find({});
        console.log(`Found ${subjects.length} subjects.`);

        console.log('\n--- Subjects with EMPTY Grade Schedules (Currently showing for ALL grades) ---');
        const emptyScheduleSubjects = subjects.filter(s => !s.gradeSchedules || s.gradeSchedules.length === 0);
        emptyScheduleSubjects.forEach(s => {
            console.log(`- [${s.name}] (ID: ${s._id})`);
        });

        console.log('\n--- Subjects with Schedules ---');
        const scheduledSubjects = subjects.filter(s => s.gradeSchedules && s.gradeSchedules.length > 0);
        scheduledSubjects.forEach(s => {
            console.log(`- [${s.name}]: Assigned to [${s.gradeSchedules.map(g => g.grade).join(', ')}]`);
        });

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await mongoose.connection.close();
        console.log('\nDone.');
    }
};

inspectSubjects();
