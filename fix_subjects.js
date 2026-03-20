const mongoose = require('mongoose');
const Subject = require('./models/Subject');
require('dotenv').config();

const fixSubjects = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        // 1. Fix Mathematics (Add Grade 06)
        const math = await Subject.findOne({ name: 'Mathematics' });
        if (math) {
            const hasG6 = math.gradeSchedules.some(s => s.grade === 'Grade 06');
            if (!hasG6) {
                console.log('Adding Grade 06 to Mathematics...');
                math.gradeSchedules.push({
                    grade: 'Grade 06',
                    day: 'Monday', // Default day
                    startDate: new Date()
                });
                await math.save();
                console.log('Mathematics updated.');
            } else {
                console.log('Mathematics already has Grade 06.');
            }
        }

        // 2. Remove Duplicate "Business & Accounting Studies" (Keep "Business and...")
        // ID: 6965e00c7a26ab9250868716 (Newer duplicate with &)
        const duplicateId = '6965e00c7a26ab9250868716';
        const duplicate = await Subject.findById(duplicateId);
        if (duplicate) {
            console.log(`Removing duplicate subject: ${duplicate.name}`);
            await Subject.findByIdAndDelete(duplicateId);
            console.log('Duplicate removed.');
        } else {
            console.log('Duplicate subject not found (already removed).');
        }

        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

fixSubjects();
