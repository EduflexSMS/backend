const mongoose = require('mongoose');
const Subject = require('./models/Subject');
require('dotenv').config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/eduflex');
        console.log('Connected to DB');

        const subjects = await Subject.find({});
        console.log('--- SUBJECT FEES ---');
        subjects.forEach(s => {
            console.log(`Subject: "${s.name}", Fee: ${s.fee}, ID: ${s._id}`);
        });
        console.log('--------------------');

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
