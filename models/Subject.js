const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    classDay: {
        type: String,
        default: 'Monday' // Provide a default if other logic relies on it but it's not strictly required from frontend
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
    color: { type: String, default: '#2196f3' }, // Hex code for UI theme
    fee: { type: Number, required: true, default: 0 },
    feeType: { type: String, enum: ['monthly', 'daily'], default: 'monthly' }
}, { timestamps: true });

module.exports = mongoose.model('Subject', subjectSchema);
