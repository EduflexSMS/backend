require('dotenv').config();
const mongoose = require('mongoose');
const Subject = require('./models/Subject');
const Student = require('./models/Student');
const Transaction = require('./models/Transaction');
const { getDashboardStats } = require('./controllers/dashboardController');
const { getDailyReport } = require('./controllers/studentController');

async function runTest() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected successfully!");

        // 1. Create a dummy daily fee subject
        console.log("\n--- Step 1: Create Dummy Subject ---");
        const subjectName = "Revision 2026 Test";
        let testSub = await Subject.findOne({ name: subjectName });
        if (!testSub) {
            testSub = new Subject({
                name: subjectName,
                description: "Rapid Revision 2026 Class",
                fee: 1500,
                feeType: "daily",
                color: "#ec4899"
            });
            await testSub.save();
            console.log("Created subject:", testSub.name, "with feeType:", testSub.feeType);
        } else {
            testSub.feeType = "daily";
            await testSub.save();
            console.log("Found and verified subject:", testSub.name, "with feeType:", testSub.feeType);
        }

        // 2. Find or create a student
        console.log("\n--- Step 2: Create Dummy Student ---");
        let testStudent = await Student.findOne({ indexNumber: "EDU-99999" });
        if (!testStudent) {
            testStudent = new Student({
                name: "Kushan Keshan",
                indexNumber: "EDU-99999",
                grade: "Grade 13",
                barcode: "EDU-99999",
                mobile: "0789232752",
                enrollments: [{
                    subject: subjectName,
                    isFreeCard: false,
                    monthlyRecords: [{
                        monthIndex: new Date().getMonth(),
                        attendance: ['present', 'pending', 'pending', 'pending', 'pending'],
                        dailyFeesPaid: [false, false, false, false, false],
                        feePaid: false
                    }]
                }]
            });
            await testStudent.save();
            console.log("Created student:", testStudent.name, "enrolled in:", subjectName);
        } else {
            // Reset records for this month
            const monthIdx = new Date().getMonth();
            const enrollment = testStudent.enrollments.find(e => e.subject === subjectName);
            if (enrollment) {
                const rec = enrollment.monthlyRecords.find(r => r.monthIndex === monthIdx);
                if (rec) {
                    rec.dailyFeesPaid = [false, false, false, false, false];
                    rec.feePaid = false;
                } else {
                    enrollment.monthlyRecords.push({
                        monthIndex: monthIdx,
                        attendance: ['present', 'pending', 'pending', 'pending', 'pending'],
                        dailyFeesPaid: [false, false, false, false, false],
                        feePaid: false
                    });
                }
            } else {
                testStudent.enrollments.push({
                    subject: subjectName,
                    isFreeCard: false,
                    monthlyRecords: [{
                        monthIndex: monthIdx,
                        attendance: ['present', 'pending', 'pending', 'pending', 'pending'],
                        dailyFeesPaid: [false, false, false, false, false],
                        feePaid: false
                    }]
                });
            }
            await testStudent.save();
            console.log("Verified student enrollment and reset records.");
        }

        // 3. Test Toggle Daily Fee Route/Controller Logic
        console.log("\n--- Step 3: Toggle Daily Fee ---");
        const monthIndex = new Date().getMonth();
        // Toggle Week 0 (first week) to paid
        let enrollment = testStudent.enrollments.find(e => e.subject === subjectName);
        let record = enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex);
        console.log("Before Toggle - Week 0 paid:", record.dailyFeesPaid[0]);

        // Simulate Controller Logic
        record.dailyFeesPaid[0] = !record.dailyFeesPaid[0];
        testStudent.markModified('enrollments');
        await testStudent.save();

        enrollment = testStudent.enrollments.find(e => e.subject === subjectName);
        record = enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex);
        console.log("After Toggle - Week 0 paid:", record.dailyFeesPaid[0]);

        // Toggle back to unpaid
        record.dailyFeesPaid[0] = !record.dailyFeesPaid[0];
        testStudent.markModified('enrollments');
        await testStudent.save();

        // 4. Test Daily Report controller logic
        console.log("\n--- Step 4: Verify Daily Report Logic ---");
        // Mock request object
        const req = {
            query: {
                subject: subjectName,
                date: new Date().toISOString().split('T')[0],
                grade: "Grade 13"
            }
        };
        const res = {
            json: (data) => {
                console.log("Daily report payload sample count:", data.length);
                if (data.length > 0) {
                    console.log("Daily report item keys:", Object.keys(data[0]));
                    console.log("First item feePaidStatus:", data[0].feePaidStatus);
                }
            },
            status: (code) => ({ json: (err) => console.error("Error", code, err) })
        };
        await getDailyReport(req, res);

        // 5. Clean up test subject and student (optional, but let's keep them or delete dummy student)
        console.log("\nCleaning up test student and subject...");
        await Student.deleteOne({ indexNumber: "EDU-99999" });
        await Subject.deleteOne({ name: subjectName });
        console.log("Cleanup complete.");

    } catch (e) {
        console.error("Test failed with error:", e);
    } finally {
        await mongoose.connection.close();
        console.log("MongoDB connection closed.");
    }
}

runTest();
