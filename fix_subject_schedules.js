
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

const fixSchedules = async () => {
    await connectDB();
    try {
        const subjects = await Subject.find({});

        for (const subject of subjects) {
            let changed = false;

            // Fix missing classDay (validation error fix)
            if (!subject.classDay) {
                console.log(`Fixing missing classDay for [${subject.name}]`);
                subject.classDay = 'Sunday';
                changed = true;
            }

            // Fix Scholarship Subjects
            if (subject.name.includes('Scholarship')) {
                const match = subject.name.match(/Grade (\d+)/);
                if (match) {
                    const gradeNum = match[1]; // "03", "04", "05"
                    const gradeStr = `Grade ${gradeNum}`;

                    // Check if already has this schedule
                    const hasSchedule = subject.gradeSchedules && subject.gradeSchedules.some(s => s.grade === gradeStr);
                    if (!hasSchedule) {
                        console.log(`Assigning [${subject.name}] to [${gradeStr}]`);
                        subject.gradeSchedules.push({
                            grade: gradeStr,
                            day: 'Sunday', // Default day
                            startDate: new Date()
                        });
                        changed = true;
                    }
                }
            }

            // Fix Business and Accounting Studies (Assign to 10 and 11)
            if (subject.name.includes('Business and Accounting Studies')) {
                const grades = ['Grade 10', 'Grade 11'];
                for (const grade of grades) {
                    if (!subject.gradeSchedules.some(s => s.grade === grade)) {
                        console.log(`Assigning [${subject.name}] to [${grade}]`);
                        subject.gradeSchedules.push({
                            grade: grade,
                            day: 'Sunday',
                            startDate: new Date()
                        });
                        changed = true;
                    }
                }
            }

            if (changed) {
                try {
                    await subject.save();
                } catch (err) {
                    console.error(`Failed to save [${subject.name}]:`, err.message);
                }
            }
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await mongoose.connection.close();
        console.log('Done.');
    }
};

fixSchedules();
