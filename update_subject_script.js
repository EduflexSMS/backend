const mongoose = require('mongoose');
const Subject = require('./models/Subject');
require('dotenv').config();

const updateSubject = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Update Mathematics to Monday
        const result = await Subject.updateOne(
            { name: 'Mathematics' },
            { $set: { classDay: 'Monday' } }
        );

        console.log('Update result:', result);

        if (result.matchedCount === 0) {
            console.log('Mathematics subject not found!');
        } else {
            console.log('Successfully updated Mathematics to Monday');
        }

        process.exit();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

updateSubject();
