
require('dotenv').config();
const mongoose = require('mongoose');
const Subject = require('./models/Subject');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('MONGODB_URI is not defined in environment variables');
    process.exit(1);
}

const updateFees = async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
        });
        console.log('MongoDB Connected');

        const subjects = await Subject.find();
        console.log(`Found ${subjects.length} subjects to update.`);

        for (const subject of subjects) {
            let newFee = 1000;
            if (subject.name.toLowerCase().includes('scholarship')) {
                newFee = 1500;
            }

            // Always update to ensure consistency
            subject.fee = newFee;
            await subject.save();
            console.log(`Updated ${subject.name}: Fee = ${newFee}`);
        }

        console.log('All subjects updated successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error updating fees:', error);
        process.exit(1);
    }
};

updateFees();
