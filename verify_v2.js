const http = require('http');

function testAttendance() {
    const uniqueIndex = 'TEST-' + Date.now();
    const data = JSON.stringify({
        name: "Test Verification Student V2",
        grade: "Grade 10",
        mobile: "0771234567",
        indexNumber: uniqueIndex,
        subjects: ["Mathematics"]
    });

    const options = {
        hostname: 'localhost',
        port: 5000,
        path: '/api/students',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            try {
                const response = JSON.parse(body);
                console.log("Student ID:", response._id);
                const enrollment = response.enrollments[0];
                const firstMonth = enrollment.monthlyRecords[0];

                console.log("Attendance Array Length:", firstMonth.attendance.length);

                if (firstMonth.attendance.length === 5) {
                    console.log("SUCCESS: Attendance has 5 slots.");
                } else {
                    console.log("FAILURE: Attendance has " + firstMonth.attendance.length + " slots.");
                }
            } catch (e) {
                console.error("Error parsing response:", e);
                console.log("Raw Body:", body);
            }
        });
    });

    req.on('error', (error) => {
        console.error("Error:", error);
    });

    req.write(data);
    req.end();
}

testAttendance();
