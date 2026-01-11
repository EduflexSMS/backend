const mongoose = require('mongoose');
const Subject = require('./models/Subject');
require('dotenv').config();

const schedules = {
    'Mathematics': [
        { grade: 'Grade 07', day: 'Tuesday', startDate: '2026-01-06' },
        { grade: 'Grade 08', day: 'Wednesday', startDate: '2026-01-07' },
        { grade: 'Grade 09', day: 'Friday', startDate: '2026-01-09' },
        { grade: 'Grade 10', day: 'Thursday', startDate: '2026-01-08' },
        { grade: 'Grade 11', day: 'Thursday', startDate: '2026-01-08' }
    ],
    'Science': [
        { grade: 'Grade 06', day: 'Saturday', startDate: '2026-01-10' },
        { grade: 'Grade 07', day: 'Saturday', startDate: '2026-01-10' },
        { grade: 'Grade 08', day: 'Saturday', startDate: '2026-01-10' },
        { grade: 'Grade 09', day: 'Saturday', startDate: '2026-01-10' },
        { grade: 'Grade 10', day: 'Saturday', startDate: '2026-01-10' },
        { grade: 'Grade 11', day: 'Saturday', startDate: '2026-01-10' }
    ],
    'ICT': [
        { grade: 'Grade 06', day: 'Saturday', startDate: '2026-01-10' },
        { grade: 'Grade 07', day: 'Saturday', startDate: '2026-01-10' },
        { grade: 'Grade 08', day: 'Saturday', startDate: '2026-01-10' },
        { grade: 'Grade 09', day: 'Saturday', startDate: '2026-01-10' },
        { grade: 'Grade 10', day: 'Saturday', startDate: '2026-01-10' },
        { grade: 'Grade 11', day: 'Saturday', startDate: '2026-01-10' }
    ],
    'English': [
        { grade: 'Grade 06', day: 'Saturday', startDate: '2026-01-10' },
        { grade: 'Grade 07', day: 'Saturday', startDate: '2026-01-10' },
        { grade: 'Grade 08', day: 'Saturday', startDate: '2026-01-10' },
        { grade: 'Grade 09', day: 'Sunday', startDate: '2026-01-11' },
        { grade: 'Grade 10', day: 'Tuesday', startDate: '2026-01-06' },
        { grade: 'Grade 11', day: 'Saturday', startDate: '2026-01-10' }
    ]
};

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        for (const [subjectName, gradeList] of Object.entries(schedules)) {
            // Find subject case-insensitive to be safe
            const subject = await Subject.findOne({ name: { $regex: new RegExp(`^${subjectName}$`, 'i') } });
            if (subject) {
                console.log(`Updating ${subject.name}...`);

                // Merge new schedules with existing if needed, or strictly replace?
                // User said "Attendence marking system should change all subjects", ensuring these specific ones exist.
                // We will overwrite gradeSchedules.

                // NOTE: We preserve previous schedules for OTHER grades if they exist? 
                // The user provided a very comprehensive list. Let's assume this is the source of truth.
                // However, replacing blindly might delete data for a grade not listed (e.g. Grade 12?).
                // But the user listed 6-11.

                // Let's iterate and update/upsert just to be safer, 
                // BUT the simplest way to "Change all subjects" is to set the array.
                // Given the explicit list, I'll replace the array to ensure cleanliness (avoid duplicates).

                subject.gradeSchedules = gradeList;
                await subject.save();
                console.log(`Updated ${subject.name} with ${gradeList.length} schedules.`);
            } else {
                console.log(`Warning: Subject "${subjectName}" not found in database.`);
            }
        }

        console.log('Update Complete.');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
