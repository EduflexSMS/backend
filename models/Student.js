const mongoose = require('mongoose');

const recordSchema = new mongoose.Schema({
  monthIndex: { type: Number, required: true }, // 0 for Jan, 11 for Dec
  feePaid: { type: Boolean, default: false },
  feePaidDate: { type: Date, default: null },
  tutesGiven: { type: Boolean, default: false },
  attendance: {
    type: [String],
    default: [],
    validate: [arrayLimit, '{PATH} exceeds the limit of 31']
  },
  dailyFeesPaid: {
    type: [Boolean],
    default: [],
    validate: [arrayLimit, '{PATH} exceeds the limit of 31']
  }
});

function arrayLimit(val) {
  return val.length <= 31;
}

const termTuteSchema = new mongoose.Schema({
  term: { type: Number, required: true }, // 1, 2, 3
  termName: { type: String },
  year: { type: Number, default: () => new Date().getFullYear() },
  fee: { type: Number, default: 400 },
  paid: { type: Boolean, default: false },
  issued: { type: Boolean, default: false },
  issuedDate: { type: Date, default: null },
  transactionId: { type: String, default: null }
});

const enrollmentSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  isFreeCard: { type: Boolean, default: false },
  enrolledAt: { type: Date, default: Date.now },
  monthlyRecords: [recordSchema],
  termTutes: [termTuteSchema]
});

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  grade: { type: String, required: true }, // Changed from school to grade
  mobile: { type: String, required: true },
  indexNumber: { type: String, required: true, unique: true },
  enrollments: [enrollmentSchema]
}, { timestamps: true });

function getEnrollmentDate(enrollment, student) {
  if (enrollment && enrollment.enrolledAt) return new Date(enrollment.enrolledAt);
  if (student && student.createdAt) return new Date(student.createdAt);
  if (student && student._id && typeof student._id.getTimestamp === 'function') {
    return student._id.getTimestamp();
  }
  return new Date();
}

const Student = mongoose.model('Student', studentSchema);
Student.getEnrollmentDate = getEnrollmentDate;

module.exports = Student;
module.exports.getEnrollmentDate = getEnrollmentDate;
