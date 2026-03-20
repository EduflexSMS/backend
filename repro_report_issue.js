const mongoose = require('mongoose');
const Student = require('./models/Student');
const app = require('./server'); // Import app to ensure DB connection logic is available or we connect manually
const reportController = require('./controllers/reportController');
const studentController = require('./controllers/studentController');

// Mock Req/Res
const mockRes = () => {
    const res = {};
    res.json = (data) => { res.data = data; return res; };
    res.status = (code) => { res.statusCode = code; return res; };
    res.setHeader = () => { };
    res.end = () => { };
    return res;
};

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/eduflex');
    console.log('Connected to DB');

    try {
        // 1. Create a Test Student
        const indexNumber = 'TEST-' + Date.now();
        const studentData = {
            name: 'Test Student Report',
            grade: 'Grade 06',
            mobile: '0771234567',
            indexNumber: indexNumber,
            subjects: ['Mathematics']
        };

        let req = { body: studentData };
        let res = mockRes();

        // Cleanup first
        await Student.deleteOne({ indexNumber });

        await studentController.createStudent(req, res);
        const student = res.data;
        console.log('Created Student:', student._id, student.name);

        // 2. Update Fee for Month 0 (January)
        // URL params: /records/:studentId/:subject/:month/:type
        req = { params: { studentId: student._id.toString(), subject: 'Mathematics', month: '0', type: 'fee' } };
        res = mockRes();
        await studentController.updateRecordStatus(req, res);
        console.log('Updated Fee for Month 0. Result feePaid:', res.data.enrollments[0].monthlyRecords[0].feePaid);

        // 3. Generate Class Report for Grade 06, Mathematics, Month 0
        req = { query: { grade: 'Grade 06', subject: 'Mathematics', month: '0' } };
        res = mockRes();
        await studentController.getClassReport(req, res);

        const reportUser = res.data.find(r => r.id.toString() === student._id.toString());
        console.log('Report Result for Student:', reportUser);

        if (reportUser && reportUser.feePaid === true) {
            console.log('SUCCESS: Fee update is reflected in Class Report.');
        } else {
            console.log('FAILURE: Fee update is NOT reflected in Class Report.');
        }

        // Cleanup
        await Student.deleteOne({ _id: student._id });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
