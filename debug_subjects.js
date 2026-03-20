const mongoose = require('mongoose');
const Subject = require('./models/Subject');
require('dotenv').config();

const debugSubjects = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const subjects = await Subject.find({});

        const fs = require('fs');
        let output = "--- SUBJECTS DEBUG ---\n";
        subjects.forEach(s => {
            output += `Name: ${s.name}\n`;
            output += `ID: ${s._id}\n`;
            output += `Schedules: ${JSON.stringify(s.gradeSchedules)}\n`;
            output += "------------------------\n";
        });
        fs.writeFileSync('subjects_dump.log', output);
        console.log("Dumped to subjects_dump.log");
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

debugSubjects();
