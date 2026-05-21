const mongoose = require('mongoose');

const markSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    marks: { type: mongoose.Schema.Types.Mixed, required: true }, // Can be a Number (0-100) or String "AB"
    grade: { type: String }
});

const examSchema = new mongoose.Schema({
    title: { type: String, required: true },
    grade: { type: String, required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    date: { type: Date, required: true, default: Date.now },
    results: [markSchema]
}, { timestamps: true });

module.exports = mongoose.model('Exam', examSchema);
