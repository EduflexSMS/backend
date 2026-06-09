const TeacherPayment = require('../models/TeacherPayment');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const User = require('../models/User');

exports.getPaymentStats = async (req, res) => {
    try {
        const { teacherId } = req.params;
        const { month, year } = req.query;

        const teacher = await User.findById(teacherId);
        if (!teacher || teacher.role !== 'teacher') {
            return res.status(404).json({ message: 'Teacher not found' });
        }

        // Find the subject assigned to this teacher
        // Note: The User model has 'assignedSubject' as a String (Subject Name). 
        // We should look up the Subject document to get the ID and Fee.
        const subject = await Subject.findOne({ name: teacher.assignedSubject });

        if (!subject) {
            return res.status(404).json({ message: 'Assigned subject not found' });
        }

        const monthIndex = parseInt(month);
        const yearInt = parseInt(year);

        // 1. Calculate Total Collected Fees for this Subject & Month
        // We need to find all students enrolled in this subject who have paid for this month.
        // NOTE: The current Student model structure makes this query a bit complex.

        // Find students enrolled in this subject
        const students = await Student.find({ "enrollments.subject": subject.name });

        let paidCount = 0;

        students.forEach(student => {
            const enrollment = student.enrollments.find(e => e.subject === subject.name);
            if (enrollment) {
                // Skip free-card students for teacher payments
                if (enrollment.isFreeCard) {
                    return;
                }

                // Check monthly records
                // Assuming monthlyRecord.monthIndex is enough (simple check). 
                // In a real app we need to check Year too, but current schema only has monthIndex.
                // For this request, I will assume the current implementation implies current year or reset yearly.
                // However, the prompt asks for "Month". I will stick to monthIndex check as per existing code patterns.

                const record = enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex);
                if (record && record.feePaid) {
                    paidCount++;
                }
            }
        });

        const totalCollected = paidCount * (subject.fee || 0);

        // 2. Check if a payment has already been made to the teacher for this month
        const existingPayment = await TeacherPayment.findOne({
            teacher: teacherId,
            subject: subject._id,
            monthIndex: monthIndex,
            year: yearInt
        });

        res.json({
            teacherName: teacher.username,
            subjectName: subject.name,
            subjectFee: subject.fee || 0,
            paidStudentCount: paidCount,
            totalCollected: totalCollected,
            suggestedPayment: totalCollected * 0.8, // 80%
            existingPayment: existingPayment || null
        });

    } catch (error) {
        console.error("Error fetching payment stats:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.createPayment = async (req, res) => {
    try {
        const { teacherId, month, year, totalCollected, paidAmount } = req.body;

        const teacher = await User.findById(teacherId);
        if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

        const subject = await Subject.findOne({ name: teacher.assignedSubject });
        if (!subject) return res.status(404).json({ message: 'Subject not found' });

        const monthIndex = parseInt(month);
        const yearInt = parseInt(year);

        // Check for duplicate
        let payment = await TeacherPayment.findOne({
            teacher: teacherId,
            subject: subject._id,
            monthIndex: monthIndex,
            year: yearInt
        });

        if (payment) {
            // Update existing? Or block?
            // Let's allow updating for now if they made a mistake
            payment.totalCollected = totalCollected;
            payment.paidAmount = paidAmount;
            payment.paidDate = Date.now();
            await payment.save();
        } else {
            payment = new TeacherPayment({
                teacher: teacherId,
                subject: subject._id,
                monthIndex: monthIndex,
                year: yearInt,
                totalCollected,
                paidAmount
            });
            await payment.save();
        }

        res.status(201).json(payment);

    } catch (error) {
        console.error("Error creating payment:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.fixFees = async (req, res) => {
    try {
        console.log("Starting Fee Fix Process (v2 - Global Update)...");

        let changes = [];

        // 1. Update All Subject Fees
        const subjects = await Subject.find({});
        for (const subject of subjects) {
            let newFee = 1000; // Default

            // Check for Scholarship
            if (subject.name.toLowerCase().includes('scholarship')) {
                newFee = 1500;
            }

            if (subject.fee !== newFee) {
                const oldFee = subject.fee;
                subject.fee = newFee;
                await subject.save();
                changes.push(`Updated Fee for '${subject.name}': ${oldFee} -> ${newFee}`);
            }
        }

        // 2. Recalculate Processed Payments
        const payments = await TeacherPayment.find({}).populate('subject');

        for (const payment of payments) {
            let subject = payment.subject;
            // Fallback if populate failed
            if (!subject || !subject.name) {
                subject = await Subject.findById(payment.subject);
            }

            if (!subject) continue;

            const monthIndex = payment.monthIndex;

            // Re-fetch students to get current count
            const students = await Student.find({ "enrollments.subject": subject.name });
            let paidCount = 0;
            students.forEach(student => {
                const enrollment = student.enrollments.find(e => e.subject === subject.name);
                if (enrollment) {
                    if (enrollment.isFreeCard) return;

                    const record = enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex);
                    if (record && record.feePaid) {
                        paidCount++;
                    }
                }
            });

            const correctTotal = paidCount * subject.fee;

            if (Math.abs(payment.totalCollected - correctTotal) > 1) {
                const oldTotal = payment.totalCollected;
                payment.totalCollected = correctTotal;

                // Recalculate share (80%)
                payment.paidAmount = correctTotal * 0.8;

                await payment.save();
                changes.push(`Fixed payment for ${subject.name} (Month ${monthIndex}): ${oldTotal} -> ${correctTotal}`);
            }
        }

        res.json({ message: "Global Fee Update & Fix Completed", changes });

    } catch (error) {
        console.error("Error fixing fees:", error);
        res.status(500).json({ message: error.message });
    }
};
