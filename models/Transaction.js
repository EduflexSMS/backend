const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    transactionId: { type: String, required: true, unique: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentName: { type: String, required: true },
    indexNumber: { type: String, required: true },
    items: [{
        subject: { type: String, required: true },
        month: { type: Number, required: true },
        monthName: { type: String, required: true },
        weekIndex: { type: Number },
        weekName: { type: String },
        amount: { type: Number, required: true }
    }],
    totalAmount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    status: { type: String, default: 'Success' }
});

module.exports = mongoose.model('Transaction', transactionSchema);
