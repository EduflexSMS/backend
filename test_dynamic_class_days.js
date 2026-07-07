require('dotenv').config();
const mongoose = require('mongoose');
const Subject = require('./models/Subject');
const Student = require('./models/Student');
const Transaction = require('./models/Transaction');
const { getDailyReport, toggleDailyFeeStatus, markAttendanceQR } = require('./controllers/studentController');
const { processCheckout } = require('./controllers/posController');

async function runTests() {
    console.log("=== Eduflex Dynamic Class Days & Fee Configuration Tests ===");
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected successfully.\n");

    const TEST_SUBJECT_NAME = "Automated Test Subject Dynamic Days";
    const TEST_GRADE = "Grade 12";
    const TEST_STUDENT_INDEX = "EDU-TEST-DYNAMIC-999";
    const TEST_STUDENT_MOBILE = "0712345678";

    try {
        // --- PREPARATION ---
        // Clean up any left-overs first
        await Subject.deleteOne({ name: TEST_SUBJECT_NAME });
        await Student.deleteOne({ indexNumber: TEST_STUDENT_INDEX });
        await Transaction.deleteMany({ indexNumber: TEST_STUDENT_INDEX });

        // --- TEST 1: CREATE SUBJECT WITH DYNAMIC DAYS ---
        console.log("1. Creating test subject with 8 class days and daily feeType...");
        const subject = new Subject({
            name: TEST_SUBJECT_NAME,
            description: "A test subject with 8 sessions a month",
            fee: 1000,
            feeType: 'daily',
            classDaysCount: 8,
            classDay: 'Wednesday',
            gradeSchedules: [{
                grade: TEST_GRADE,
                day: 'Wednesday'
            }, {
                grade: TEST_GRADE,
                day: 'Sunday'
            }]
        });
        await subject.save();
        console.log("Subject created successfully.\n");

        // --- TEST 2: CREATE STUDENT AND VERIFY ENROLLMENT INITIALIZATION ---
        console.log("2. Creating test student and verifying record initialization...");
        const { createStudent } = require('./controllers/studentController');
        
        // Mock request & response for createStudent
        let studentResponseData = null;
        const mockReqCreate = {
            body: {
                name: "Test Dynamic Student",
                grade: TEST_GRADE,
                mobile: TEST_STUDENT_MOBILE,
                indexNumber: TEST_STUDENT_INDEX,
                subjects: [TEST_SUBJECT_NAME]
            }
        };
        const mockResCreate = {
            status: (code) => {
                return {
                    json: (data) => {
                        studentResponseData = data;
                    }
                };
            },
            json: (data) => {
                studentResponseData = data;
            }
        };
        await createStudent(mockReqCreate, mockResCreate);

        if (!studentResponseData || !studentResponseData._id) {
            throw new Error("Failed to create student: " + JSON.stringify(studentResponseData));
        }

        let student = await Student.findOne({ indexNumber: TEST_STUDENT_INDEX });
        const enrollment = student.enrollments.find(e => e.subject === TEST_SUBJECT_NAME);
        if (!enrollment) {
            throw new Error("Enrollment not found on student.");
        }
        
        const currentMonthIdx = new Date().getMonth();
        const monthRecord = enrollment.monthlyRecords.find(r => r.monthIndex === currentMonthIdx);
        
        console.log(`- Attendance array length: ${monthRecord.attendance.length}`);
        console.log(`- Daily fees paid array length: ${monthRecord.dailyFeesPaid.length}`);
        
        if (monthRecord.attendance.length === 8 && monthRecord.dailyFeesPaid.length === 8) {
            console.log("✅ Success: Arrays correctly initialized to 8 slots.\n");
        } else {
            throw new Error(`Failure: Expected array length 8, got attendance: ${monthRecord.attendance.length}, dailyFeesPaid: ${monthRecord.dailyFeesPaid.length}`);
        }

        // --- TEST 3: SELF-HEALING ARRAYS ---
        console.log("3. Testing self-healing capabilities on legacy / shorter student records...");
        // Shrink arrays manually to simulate old/legacy data (length 5)
        monthRecord.attendance = ['present', 'pending', 'pending', 'pending', 'pending'];
        monthRecord.dailyFeesPaid = [true, false, false, false, false];
        student.markModified('enrollments');
        await student.save();
        
        // Verify they are now length 5
        student = await Student.findOne({ indexNumber: TEST_STUDENT_INDEX });
        let record = student.enrollments[0].monthlyRecords.find(r => r.monthIndex === currentMonthIdx);
        console.log(`- Before self-healing: Attendance length is ${record.attendance.length}`);
        
        // Trigger self-healing via getDailyReport query
        // Mock query for today
        const mockReqReport = {
            query: {
                date: new Date().toISOString().split('T')[0],
                grade: TEST_GRADE,
                subject: TEST_SUBJECT_NAME
            }
        };
        let reportData = null;
        const mockResReport = {
            json: (data) => {
                reportData = data;
            },
            status: (code) => {
                return {
                    json: (data) => { console.error("Report Error:", data); }
                };
            }
        };
        await getDailyReport(mockReqReport, mockResReport);
        
        // Check student in database to see if self-healing applied
        student = await Student.findOne({ indexNumber: TEST_STUDENT_INDEX });
        record = student.enrollments[0].monthlyRecords.find(r => r.monthIndex === currentMonthIdx);
        
        console.log(`- After getDailyReport call: Attendance length is ${record.attendance.length}`);
        console.log(`- After getDailyReport call: Daily fees paid length is ${record.dailyFeesPaid.length}`);
        
        if (record.attendance.length === 8 && record.dailyFeesPaid.length === 8) {
            console.log("✅ Success: Self-healing expanded arrays to 8 correctly.\n");
        } else {
            throw new Error(`Failure: Self-healing did not expand arrays to 8. Lengths: attendance=${record.attendance.length}, dailyFeesPaid=${record.dailyFeesPaid.length}`);
        }

        // --- TEST 4: TOGGLE DAILY FEE STATUS ---
        console.log("4. Testing toggleDailyFeeStatus controller...");
        // Let's toggle slot 2 (index 2) of dailyFeesPaid from false to true
        const mockReqToggle = {
            params: {
                studentId: student._id.toString(),
                subject: TEST_SUBJECT_NAME,
                month: currentMonthIdx.toString(),
                weekIndex: "2"
            }
        };
        let toggleResponse = null;
        const mockResToggle = {
            json: (data) => {
                toggleResponse = data;
            },
            status: (code) => {
                return {
                    json: (data) => { console.error("Toggle Error:", data); }
                };
            }
        };
        await toggleDailyFeeStatus(mockReqToggle, mockResToggle);
        
        student = await Student.findOne({ indexNumber: TEST_STUDENT_INDEX });
        record = student.enrollments[0].monthlyRecords.find(r => r.monthIndex === currentMonthIdx);
        
        console.log(`- Slot 2 dailyFeesPaid status: ${record.dailyFeesPaid[2]}`);
        console.log(`- Slot 2 attendance status: ${record.attendance[2]}`);
        
        if (record.dailyFeesPaid[2] === true && record.attendance[2] === 'present') {
            console.log("✅ Success: Toggling fee marked it as paid and automatically set attendance to present.\n");
        } else {
            throw new Error(`Failure: Toggle fee did not work as expected. paid: ${record.dailyFeesPaid[2]}, attendance: ${record.attendance[2]}`);
        }

        // --- TEST 5: POS CHECKOUT FOR DYNAMIC FEE ---
        console.log("5. Testing processCheckout (POS) for dynamic fee session...");
        // Let's checkout slot 4 (index 4) for this subject
        const mockReqCheckout = {
            body: {
                studentId: student._id.toString(),
                items: [{
                    subject: TEST_SUBJECT_NAME,
                    month: currentMonthIdx,
                    monthName: "July",
                    weekIndex: 4,
                    weekName: "Day 5",
                    amount: 1000
                }],
                totalAmount: 1000
            }
        };
        let checkoutResponse = null;
        const mockResCheckout = {
            status: (code) => {
                return {
                    json: (data) => {
                        checkoutResponse = data;
                    }
                };
            },
            json: (data) => {
                checkoutResponse = data;
            }
        };
        
        // Temporarily clear instance ID to avoid making actual HTTP requests to Ultramsg in unit test
        const originalInstanceId = process.env.ULTRAMSG_INSTANCE_ID;
        delete process.env.ULTRAMSG_INSTANCE_ID;
        
        await processCheckout(mockReqCheckout, mockResCheckout);
        
        // Restore instance ID
        process.env.ULTRAMSG_INSTANCE_ID = originalInstanceId;

        student = await Student.findOne({ indexNumber: TEST_STUDENT_INDEX });
        record = student.enrollments[0].monthlyRecords.find(r => r.monthIndex === currentMonthIdx);

        console.log(`- Slot 4 dailyFeesPaid status after checkout: ${record.dailyFeesPaid[4]}`);
        console.log(`- Slot 4 attendance status after checkout: ${record.attendance[4]}`);

        if (record.dailyFeesPaid[4] === true && record.attendance[4] === 'present') {
            console.log("✅ Success: POS checkout successfully marked the daily fee slot and updated attendance.\n");
        } else {
            throw new Error(`Failure: POS checkout failed to update student record. paid: ${record.dailyFeesPaid[4]}, attendance: ${record.attendance[4]}`);
        }

        // --- TEST 6: DOCKING QR MARK ATTENDANCE ---
        console.log("6. Testing QR attendance marker controller...");
        // Let's mark attendance using QR scanner
        const mockReqQR = {
            body: {
                indexNumber: TEST_STUDENT_INDEX,
                subject: TEST_SUBJECT_NAME,
                grade: TEST_GRADE
            }
        };
        let qrResponse = null;
        const mockResQR = {
            json: (data) => {
                qrResponse = data;
            },
            status: (code) => {
                return {
                    json: (data) => { qrResponse = data; }
                };
            }
        };
        await markAttendanceQR(mockReqQR, mockResQR);
        
        console.log(`- QR response: ${JSON.stringify(qrResponse)}`);
        
        student = await Student.findOne({ indexNumber: TEST_STUDENT_INDEX });
        record = student.enrollments[0].monthlyRecords.find(r => r.monthIndex === currentMonthIdx);
        
        // Find which slot was marked (it would calculate chronologically, or fall back to the first pending slot)
        const markedIndex = record.attendance.indexOf('present');
        console.log(`- Marked attendance index: ${markedIndex}`);
        
        if (markedIndex !== -1 && qrResponse.status === 'success') {
            console.log("✅ Success: QR attendance marked successfully.\n");
        } else {
            throw new Error("Failure: QR attendance was not marked present.");
        }

        console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! Dynamic Class Days & Fee Configuration is fully functional.");

    } catch (error) {
        console.error("❌ TEST FAILURE:", error.message);
        console.error(error.stack);
    } finally {
        // --- CLEANUP ---
        console.log("\nCleaning up test database items...");
        await Subject.deleteOne({ name: TEST_SUBJECT_NAME });
        await Student.deleteOne({ indexNumber: TEST_STUDENT_INDEX });
        await Transaction.deleteMany({ indexNumber: TEST_STUDENT_INDEX });
        console.log("Cleanup finished.");

        await mongoose.disconnect();
        console.log("Disconnected from database.");
    }
}

runTests();
