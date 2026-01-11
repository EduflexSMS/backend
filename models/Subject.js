const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    classDay: {
        type: String,
        required: true,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    },
    gradeSchedules: [{
        grade: { type: String, required: true }, // e.g., 'Grade 07'
        day: {
            type: String,
            required: true,
            enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        },
        startDate: { type: Date } // Optional start date for this grade's schedule
    }],
    color: { type: String, default: '#2196f3' } // Hex code for UI theme
}, { timestamps: true });

module.exports = mongoose.model('Subject', subjectSchema);
