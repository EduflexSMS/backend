const mongoose = require('mongoose');

const recordSchema = new mongoose.Schema({
  monthIndex: { type: Number, required: true }, // 0 for Jan, 11 for Dec
  feePaid: { type: Boolean, default: false },
  tutesGiven: { type: Boolean, default: false },
  attendance: {
    type: [Boolean],
    type: [Boolean],
    default: [false, false, false, false, false],
    validate: [arrayLimit, '{PATH} exceeds the limit of 5']
  }
});

function arrayLimit(val) {
  return val.length <= 5;
}

const enrollmentSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  monthlyRecords: [recordSchema]
});

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  grade: { type: String, required: true }, // Changed from school to grade
  mobile: { type: String, required: true },
  indexNumber: { type: String, required: true, unique: true },
  enrollments: [enrollmentSchema]
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
