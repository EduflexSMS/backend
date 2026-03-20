const mongoose = require('mongoose');

const teacherPaymentSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    monthIndex: { type: Number, required: true }, // 0-11
    year: { type: Number, required: true },
    totalCollected: { type: Number, required: true }, // Snapshot of collected fees
    paidAmount: { type: Number, required: true },
    paidDate: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('TeacherPayment', teacherPaymentSchema);
