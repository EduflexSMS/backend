const mongoose = require('mongoose');
const Subject = require('./models/Subject');
const TeacherPayment = require('./models/TeacherPayment');
const Student = require('./models/Student');
require('dotenv').config();

async function run() {
    try {
        console.log("Connecting to Database...");
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/eduflex');
        console.log('Connected to DB');

        // 1. Fix Mathematics Fee
        const mathSubject = await Subject.findOne({ name: 'Mathematics' });
        if (mathSubject) {
            console.log(`Checking Mathematics Subject... Current Fee: ${mathSubject.fee}`);
            if (mathSubject.fee === 96000) {
                console.log("Found incorrect fee (96000). Updating to 1000.");
                mathSubject.fee = 1000;
                await mathSubject.save();
                console.log("Mathematics Fee updated to 1000.");
            } else {
                console.log("Mathematics Fee is already: " + mathSubject.fee + ". (Ensuring it is 1000)");
                if (mathSubject.fee !== 1000) {
                    // Uncomment if we want to force 1000 even if it wasn't 96000
                    // mathSubject.fee = 1000;
                    // await mathSubject.save();
                    console.log("Warning: Fee is not 96000 or 1000. Leaving as is.");
                }
            }
        } else {
            console.log("Subject 'Mathematics' not found.");
        }

        // 2. Recalculate Processed Payments
        console.log("Scanning Teacher Payments to fix totals...");
        const payments = await TeacherPayment.find({}).populate('subject');

        for (const payment of payments) {
            const subject = payment.subject;
            if (!subject) continue;

            const monthIndex = payment.monthIndex;

            // Calculate correct stats
            const students = await Student.find({ "enrollments.subject": subject.name });
            let paidCount = 0;
            students.forEach(student => {
                const enrollment = student.enrollments.find(e => e.subject === subject.name);
                if (enrollment) {
                    const record = enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex);
                    if (record && record.feePaid) {
                        paidCount++;
                    }
                }
            });

            const correctTotal = paidCount * subject.fee;

            // Allow a small margin of error or check for mismatch
            if (payment.totalCollected !== correctTotal) {
                console.log(`Payment Mismatch for ${subject.name} (Month: ${monthIndex}):`);
                console.log(`   Stored Total: ${payment.totalCollected}`);
                console.log(`   Calculated Total: ${correctTotal} (Count: ${paidCount} * Fee: ${subject.fee})`);

                payment.totalCollected = correctTotal;

                // Recalculate share (80%)
                // We assume the stored paidAmount followed the 80% rule or needs to be fixed to it
                // If the stored paidAmount is wildly different (e.g. based on 9.2m), we must fix it.

                const oldShare = payment.paidAmount;
                const newShare = correctTotal * 0.8;

                console.log(`   Updating Share: ${oldShare} -> ${newShare}`);
                payment.paidAmount = newShare;

                await payment.save();
                console.log("   --> FIXED.");
            }
        }

        console.log("All payments verified/fixed.");

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
