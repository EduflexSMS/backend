const Student = require('../models/Student');
const Joi = require('joi');
const ExcelJS = require('exceljs');

// ... existing code ...

// GET /reports/monthly
exports.getMonthlyReport = async (req, res) => {
    try {
        const { grade, subject, month } = req.query; // month is 0-11

        if (!grade || !subject || month === undefined) {
            return res.status(400).json({ message: 'Grade, Subject and Month are required' });
        }

        const monthIndex = parseInt(month);

        // Fetch Subject Details to get Class Day
        const Subject = require('../models/Subject'); // Ensure imported if not global
        const subjectObj = await Subject.findOne({ name: subject });

        // Fetch students
        const students = await Student.find({
            grade: grade,
            'enrollments.subject': subject
        });

        if (students.length === 0) {
            return res.status(404).json({ message: 'No students found for this class' });
        }

        // Create Workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Monthly Report');

        // Add Headers
        worksheet.columns = [
            { header: 'Index Number', key: 'indexNumber', width: 15 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Mobile', key: 'mobile', width: 15 },
            { header: 'Attendance (Days)', key: 'attendance', width: 20 },
            { header: 'Fee Paid', key: 'feePaid', width: 10 },
            { header: 'Tutes Given', key: 'tutesGiven', width: 15 }
        ];

        // Add Rows
        students.forEach(student => {
            const enrollment = student.enrollments.find(e => e.subject === subject);
            const record = enrollment ? enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex) : null;

            if (record) {
                const attendanceCount = record.attendance.filter(a => a === true || a === 'present').length;

                // Helper to calculate days
                const getDays = (monthIdx, year, dayInfo) => {
                    const { day: dayName, startDate } = dayInfo;
                    const date = new Date(year, monthIdx, 1);
                    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

                    // Normalize Start Date
                    const start = startDate ? new Date(startDate) : null;
                    if (start) start.setHours(0, 0, 0, 0);

                    let count = 0;
                    while (date.getMonth() === monthIdx) {
                        if (days[date.getDay()] === dayName) {
                            const currentDate = new Date(date);
                            currentDate.setHours(0, 0, 0, 0);
                            if (!start || currentDate >= start) {
                                count++;
                            }
                        }
                        date.setDate(date.getDate() + 1);
                    }
                    return count;
                };

                const currentYear = new Date().getFullYear();

                // Determine Day and StartDate based on Grade
                let classDayInfo = { day: subjectObj ? subjectObj.classDay : 'Monday', startDate: null };

                if (subjectObj && subjectObj.gradeSchedules) {
                    const schedule = subjectObj.gradeSchedules.find(s => s.grade === grade);
                    if (schedule) {
                        classDayInfo = { day: schedule.day, startDate: schedule.startDate };
                    }
                }

                // subjectObj is fetched at the top of the function now
                const maxDays = subjectObj ? getDays(monthIndex, currentYear, classDayInfo) : 5;

                worksheet.addRow({
                    indexNumber: student.indexNumber,
                    name: student.name,
                    mobile: student.mobile,
                    attendance: `${attendanceCount} / ${maxDays}`,
                    feePaid: record.feePaid ? 'Yes' : 'No',
                    tutesGiven: record.tutesGiven ? 'Yes' : 'No'
                });
            } else {
                worksheet.addRow({
                    indexNumber: student.indexNumber,
                    name: student.name,
                    mobile: student.mobile,
                    attendance: 'N/A',
                    feePaid: 'N/A',
                    tutesGiven: 'N/A'
                });
            }
        });

        // Style Headers
        worksheet.getRow(1).font = { bold: true };

        // Set Response Headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Report_${subject}_${grade}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error("Report Generation Error:", error);
        res.status(500).json({ message: error.message });
    }
};


// Validation Schema
const studentSchema = Joi.object({
    name: Joi.string().required(),
    grade: Joi.string().required(), // Replaced school with grade
    mobile: Joi.string().pattern(/^[0-9+\-\s()]+$/).required(),
    indexNumber: Joi.string().optional(), // Auto-generated if not provided
    subjects: Joi.array().items(Joi.string()).optional() // Initial subjects
});

// Helper to create 12 monthly records
function initializeRecords() {
    const records = [];
    for (let i = 0; i < 12; i++) {
        records.push({
            monthIndex: i,
            feePaid: false,
            tutesGiven: false,
            attendance: ['pending', 'pending', 'pending', 'pending', 'pending']
        });
    }
    return records;
}

// GET /students
exports.getStudents = async (req, res) => {
    try {
        const { page = 1, limit = 10, search } = req.query;
        const query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { indexNumber: { $regex: search, $options: 'i' } },
                { grade: { $regex: search, $options: 'i' } }, // Search by grade
                { 'enrollments.subject': { $regex: search, $options: 'i' } }
            ];
        }

        const students = await Student.find(query)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        const count = await Student.countDocuments(query);

        res.json({
            students,
            totalPages: Math.ceil(count / limit),
            currentPage: page
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /students
exports.createStudent = async (req, res) => {
    try {
        const { error } = studentSchema.validate(req.body);
        if (error) return res.status(400).json({ message: error.details[0].message });

        let { indexNumber, subjects } = req.body;

        if (!indexNumber) {
            // Auto-generate index if not provided (Simplistic approach: Timestamp based or Random)
            indexNumber = 'STU-' + Date.now().toString().slice(-6);
        }

        // Check uniqueness
        const existing = await Student.findOne({ indexNumber });
        if (existing) return res.status(400).json({ message: 'Index Number must be unique' });

        const enrollments = (subjects || []).map(subject => ({
            subject,
            monthlyRecords: initializeRecords()
        }));

        const student = new Student({
            ...req.body,
            indexNumber,
            enrollments
        });

        await student.save();
        res.status(201).json(student);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PUT /students/:id
// PUT /students/:id
exports.updateStudent = async (req, res) => {
    try {
        const { id } = req.params;
        const { subjects, ...updateData } = req.body; // Separate subjects from other data

        const student = await Student.findById(id);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        // Update basic fields
        Object.assign(student, updateData);

        // Handle Subject Additions
        // Handle Subject Updates (Add & Remove)
        if (subjects && Array.isArray(subjects)) {
            // 1. Remove subjects NOT in the new list
            student.enrollments = student.enrollments.filter(enrollment =>
                subjects.includes(enrollment.subject)
            );

            // 2. Add new subjects
            const existingSubjects = student.enrollments.map(e => e.subject);
            const newSubjects = subjects.filter(sub => !existingSubjects.includes(sub));

            if (newSubjects.length > 0) {
                const newEnrollments = newSubjects.map(subject => ({
                    subject,
                    monthlyRecords: initializeRecords()
                }));
                student.enrollments.push(...newEnrollments);
            }
        }

        await student.save();
        res.json(student);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// PATCH /attendance/:studentId/:subject/:month/:week
exports.markAttendance = async (req, res) => {
    try {
        const { studentId, subject, month, week } = req.params; // month: 0-11, week: 0-3
        const { status } = req.body; // Expect 'present', 'absent', or 'pending'

        const student = await Student.findById(studentId);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const enrollment = student.enrollments.find(e => e.subject === subject);
        if (!enrollment) return res.status(404).json({ message: 'Subject enrollment not found' });

        const record = enrollment.monthlyRecords.find(r => r.monthIndex === parseInt(month));
        if (!record) return res.status(404).json({ message: 'Month record not found' });

        // Update status
        // If status is provided in body, use it. Otherwise, simple toggle for legacy support (or error)
        if (status) {
            record.attendance[week] = status;
        } else {
            // Fallback/Legacy toggle: Pending -> Present -> Absent -> Pending (Cycle)
            const current = record.attendance[week];
            if (current === 'present' || current === true || current === 'true') record.attendance[week] = 'absent';
            else if (current === 'absent') record.attendance[week] = 'pending';
            else record.attendance[week] = 'present';
        }

        // Ensure atomic update for Mongoose array
        student.markModified('enrollments');
        await student.save();

        res.json(student);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// PATCH /records/:studentId/:subject/:month/:type
exports.updateRecordStatus = async (req, res) => {
    try {
        const { studentId, subject, month, type } = req.params; // type: 'fee' or 'tute'
        console.log(`Update Request: ${studentId}, ${subject}, ${month}, ${type}`);

        const student = await Student.findById(studentId);
        if (!student) {
            console.log('Student not found');
            return res.status(404).json({ message: 'Student not found' });
        }

        const enrollment = student.enrollments.find(e => e.subject === subject);
        if (!enrollment) {
            console.log(`Enrollment not found for subject: ${subject}`);
            return res.status(404).json({ message: 'Subject enrollment not found' });
        }

        const record = enrollment.monthlyRecords.find(r => r.monthIndex === parseInt(month));
        if (!record) {
            console.log(`Record not found for month: ${month}`);
            return res.status(404).json({ message: 'Month record not found' });
        }

        if (type === 'fee') {
            // Toggle
            console.log(`Toggling Fee: ${record.feePaid} -> ${!record.feePaid}`);
            record.feePaid = !record.feePaid;
        } else if (type === 'tute') {
            // Toggle
            console.log(`Toggling Tute: ${record.tutesGiven} -> ${!record.tutesGiven}`);
            record.tutesGiven = !record.tutesGiven;
        } else {
            console.log('Invalid type');
            return res.status(400).json({ message: 'Invalid type' });
        }

        await student.save();
        res.json(student);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// GET /reports/class-report
exports.getClassReport = async (req, res) => {
    try {
        const { grade, subject, month } = req.query; // month is 0-11 index

        if (!grade || !subject || month === undefined) {
            return res.status(400).json({ message: 'Grade, Subject and Month are required' });
        }

        const monthIndex = parseInt(month);

        // Robust grade matching: handle "Grade 6" vs "Grade 06"
        const gradeNum = parseInt(grade.replace(/\D/g, ''));
        const gradeRegex = new RegExp(`^Grade 0?${gradeNum}$`, 'i');

        // Find students in the grade who have the subject in enrollments
        const students = await Student.find({
            grade: { $regex: gradeRegex },
            'enrollments.subject': subject
        });

        const report = students.map(student => {
            const enrollment = student.enrollments.find(e => e.subject === subject);
            // Initialize Default Record if not found (or just return nulls)
            // Ideally records are initialized on creation, but for safety:
            const record = enrollment ? enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex) : null;

            return {
                id: student._id,
                name: student.name,
                indexNumber: student.indexNumber,
                mobile: student.mobile,
                attendance: record ? record.attendance : [],
                feePaid: record ? record.feePaid : false,
                tutesGiven: record ? record.tutesGiven : false
            };
        });

        res.json(report);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
