const mongoose = require('mongoose');

const classSessionSchema = new mongoose.Schema({
    subject: { type: String, required: true },
    grade: { type: String, required: true },
    monthIndex: { type: Number, required: true },
    weekIndex: { type: Number, required: true },
    startTime: { type: Date, default: Date.now },
    absentMarked: { type: Boolean, default: false }
}, { timestamps: true });

// Avoid duplicate sessions for the same class in the same week
classSessionSchema.index({ subject: 1, grade: 1, monthIndex: 1, weekIndex: 1 }, { unique: true });

module.exports = mongoose.model('ClassSession', classSessionSchema);
