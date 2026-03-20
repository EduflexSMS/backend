const axios = require('axios');

async function testAttendance() {
    try {
        const uniqueIndex = 'TEST-' + Date.now();
        const student = {
            name: "Test Verification Student",
            grade: "Grade 10",
            mobile: "0771234567",
            indexNumber: uniqueIndex,
            subjects: ["Mathematics"]
        };

        console.log("Creating student...");
        const response = await axios.post('http://localhost:5000/api/students', student);

        console.log("Student ID:", response.data._id);
        const enrollment = response.data.enrollments[0];
        const firstMonth = enrollment.monthlyRecords[0];

        console.log("Attendance Array Length:", firstMonth.attendance.length);
        console.log("Attendance Array:", firstMonth.attendance);

        if (firstMonth.attendance.length === 5) {
            console.log("SUCCESS: Attendance has 5 slots.");
        } else {
            console.log("FAILURE: Attendance has " + firstMonth.attendance.length + " slots.");
        }

    } catch (error) {
        console.error("Error during verification:", error.response ? error.response.data : error.message);
    }
}

testAttendance();
