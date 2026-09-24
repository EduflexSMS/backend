const Student = require('../models/Student');
const Joi = require('joi');
const ExcelJS = require('exceljs');
const { getClassDaysCountForMonth } = require('../utils/calendarHelper');

const getGradeRegex = (grade) => {
    if (!grade) return /.*/;
    const trimmed = grade.trim();
    const simpleMatch = trimmed.match(/^Grade\s*0*(\d+)$/i);
    if (simpleMatch) {
        const num = parseInt(simpleMatch[1], 10);
        return new RegExp(`^Grade\\s*0*${num}$`, 'i');
    }
    return new RegExp(`^${trimmed.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i');
};

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

            const currentYear = new Date().getFullYear();
            const enrollDate = Student.getEnrollmentDate(enrollment, student);
            const enrollYear = enrollDate.getFullYear();
            const enrollMonth = enrollDate.getMonth();
            const notEnrolled = enrollYear > currentYear || (enrollYear === currentYear && monthIndex < enrollMonth);

            if (notEnrolled) {
                worksheet.addRow({
                    indexNumber: student.indexNumber,
                    name: student.name,
                    mobile: student.mobile,
                    attendance: 'Not Enrolled',
                    feePaid: 'Not Enrolled',
                    tutesGiven: 'Not Enrolled'
                });
            } else if (record) {
                const attendanceCount = record.attendance.filter(a => a === true || a === 'present').length;

                // Helper to calculate days based on all scheduled days for a grade
                const getDays = (monthIdx, year, schedules, defaultDay = 'Monday') => {
                    const date = new Date(year, monthIdx, 1);
                    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

                    let scheduledDays = [];
                    let startDatesMap = {};

                    if (schedules && schedules.length > 0) {
                        scheduledDays = schedules.map(s => s.day);
                        schedules.forEach(s => {
                            if (s.startDate) {
                                startDatesMap[s.day] = new Date(s.startDate);
                                startDatesMap[s.day].setHours(0, 0, 0, 0);
                            }
                        });
                    } else {
                        scheduledDays = [defaultDay];
                    }

                    let count = 0;
                    while (date.getMonth() === monthIdx) {
                        const dayName = days[date.getDay()];
                        if (scheduledDays.includes(dayName)) {
                            const currentDate = new Date(date);
                            currentDate.setHours(0, 0, 0, 0);
                            const start = startDatesMap[dayName];
                            if (!start || currentDate >= start) {
                                count++;
                            }
                        }
                        date.setDate(date.getDate() + 1);
                    }
                    return count;
                };

                const gradeSchedules = subjectObj ? subjectObj.gradeSchedules.filter(s => s.grade === grade) : [];
                const defaultClassDay = subjectObj ? subjectObj.classDay : 'Monday';

                const maxDays = subjectObj ? getDays(monthIndex, currentYear, gradeSchedules, defaultClassDay) : 5;

                const paidDays = record.dailyFeesPaid ? record.dailyFeesPaid.filter(Boolean).length : 0;

                worksheet.addRow({
                    indexNumber: student.indexNumber,
                    name: student.name,
                    mobile: student.mobile,
                    attendance: `${attendanceCount} / ${maxDays}`,
                    feePaid: enrollment.isFreeCard ? 'Free Card' : (subjectObj && subjectObj.feeType === 'daily' ? `${paidDays} paid` : (record.feePaid ? 'Yes' : 'No')),
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
    subjects: Joi.array().items(Joi.string()).optional(), // Initial subjects
    freeCardSubjects: Joi.array().items(Joi.string()).optional() // Initial free card subjects
});

// Helper to create 12 monthly records
function initializeRecords(classDaysCount = 5) {
    const records = [];
    for (let i = 0; i < 12; i++) {
        records.push({
            monthIndex: i,
            feePaid: false,
            feePaidDate: null,
            tutesGiven: false,
            attendance: Array(classDaysCount).fill('pending'),
            dailyFeesPaid: Array(classDaysCount).fill(false)
        });
    }
    return records;
}

// Helper to create 12 monthly records dynamically based on actual calendar days
function initializeRecordsDynamic(subjectObj, grade, year = new Date().getFullYear()) {
    const records = [];
    for (let i = 0; i < 12; i++) {
        const classDaysCount = getClassDaysCountForMonth(subjectObj, grade, year, i);
        records.push({
            monthIndex: i,
            feePaid: false,
            feePaidDate: null,
            tutesGiven: false,
            attendance: Array(classDaysCount).fill('pending'),
            dailyFeesPaid: Array(classDaysCount).fill(false)
        });
    }
    return records;
}

// GET /students/grades
exports.getGrades = async (req, res) => {
    try {
        const { detailed } = req.query;

        // 1. Get distinct grades from existing students
        const distinctGrades = await Student.distinct('grade');

        // 2. Fetch configured grades from Setting
        const Setting = require('../models/Setting');
        let settingRecord = await Setting.findOne({ key: 'grades_config' });
        let configuredGrades = settingRecord && Array.isArray(settingRecord.value) ? settingRecord.value : null;

        // Fallback default list if no configuration exists yet
        const defaultGrades = [
            { name: 'Grade 03', shortCode: '03', whatsappLink: 'https://chat.whatsapp.com/JDa517chrKQ9459MfzRSZC' },
            { name: 'Grade 04', shortCode: '04', whatsappLink: 'https://chat.whatsapp.com/Il7vUb6trXOBViX4U46dfm' },
            { name: 'Grade 05', shortCode: '05', whatsappLink: 'https://chat.whatsapp.com/K0df52vVfPoDjFuLtYrneG' },
            { name: 'Grade 06', shortCode: '06', whatsappLink: 'https://chat.whatsapp.com/Ebz4zJgdDhDEn1p2Z6HzbX' },
            { name: 'Grade 07', shortCode: '07', whatsappLink: 'https://chat.whatsapp.com/Ko87JpVAHdMJ3UCIDHh22a' },
            { name: 'Grade 08', shortCode: '08', whatsappLink: 'https://chat.whatsapp.com/LfrLuuB0NmE37Bul1cSwog' },
            { name: 'Grade 09', shortCode: '09', whatsappLink: 'https://chat.whatsapp.com/KEoJ2cotqWUA92EZA5R4W7' },
            { name: 'Grade 10', shortCode: '10', whatsappLink: 'https://chat.whatsapp.com/KOJD2PNrd936IHgWxLGotB' },
            { name: 'Grade 11', shortCode: '11', whatsappLink: 'https://chat.whatsapp.com/IuCquSU1EPHB9TcORCUdrz' },
            { name: 'Rapid Revision', shortCode: 'RR', whatsappLink: 'https://chat.whatsapp.com/DsOyVcdCWhO5SaKaWdRSLo' }
        ];

        let gradeList = configuredGrades ? [...configuredGrades] : [...defaultGrades];

        // Ensure all distinct grades from students are present in gradeList
        distinctGrades.forEach(dg => {
            if (dg && !gradeList.some(g => (typeof g === 'string' ? g : g.name).toLowerCase() === dg.toLowerCase())) {
                gradeList.push({
                    name: dg,
                    shortCode: '',
                    whatsappLink: ''
                });
            }
        });

        // Normalize all items to { name, shortCode, whatsappLink }
        let normalized = gradeList.map(g => {
            if (typeof g === 'string') {
                return { name: g, shortCode: '', whatsappLink: '' };
            }
            return {
                name: g.name || '',
                shortCode: g.shortCode || '',
                whatsappLink: g.whatsappLink || ''
            };
        }).filter(g => g.name.trim() !== '');

        // Deduplicate by lowercase name
        const seen = new Set();
        normalized = normalized.filter(g => {
            const key = g.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Count students per grade using aggregation
        const counts = await Student.aggregate([
            { $group: { _id: '$grade', count: { $sum: 1 } } }
        ]);
        const countMap = {};
        counts.forEach(c => {
            if (c._id) countMap[c._id.toLowerCase()] = c.count;
        });

        // Attach studentCount & helper shortCode if empty
        normalized = normalized.map(g => {
            const count = countMap[g.name.toLowerCase()] || 0;
            let code = g.shortCode;
            if (!code) {
                if (g.name.toLowerCase() === 'rapid revision') {
                    code = 'RR';
                } else {
                    const numMatch = g.name.match(/\d+/);
                    if (numMatch) {
                        code = numMatch[0].padStart(2, '0');
                    } else {
                        const words = g.name.trim().split(/\s+/);
                        code = words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : g.name.slice(0, 2).toUpperCase();
                    }
                }
            }
            return {
                ...g,
                shortCode: code,
                studentCount: count
            };
        });

        // Sort grades naturally (Grade 03, Grade 04, ..., Rapid Revision/others)
        normalized.sort((a, b) => {
            const numA = parseInt(a.name.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.name.replace(/\D/g, '')) || 0;
            if (numA === 0 && numB !== 0) return 1;
            if (numB === 0 && numA !== 0) return -1;
            if (numA === 0 && numB === 0) return a.name.localeCompare(b.name);
            return numA - numB;
        });

        if (detailed === 'true') {
            return res.json(normalized);
        }

        // Return plain strings for backward compatibility
        res.json(normalized.map(g => g.name));
    } catch (error) {
        console.error("Error in getGrades:", error);
        res.status(500).json({ message: error.message });
    }
};

// POST /students/grades
exports.createGrade = async (req, res) => {
    try {
        const { name, shortCode, whatsappLink } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Grade name is required' });
        }
        const trimmedName = name.trim();

        const Setting = require('../models/Setting');
        let settingRecord = await Setting.findOne({ key: 'grades_config' });
        let grades = settingRecord && Array.isArray(settingRecord.value) ? settingRecord.value : [];

        // Check if already exists in setting or students
        const existingInStudents = await Student.findOne({ grade: trimmedName });
        if (grades.some(g => (g.name || g).toLowerCase() === trimmedName.toLowerCase()) || existingInStudents) {
            return res.status(400).json({ message: `Grade "${trimmedName}" already exists` });
        }

        const newGrade = {
            name: trimmedName,
            shortCode: (shortCode || '').trim(),
            whatsappLink: (whatsappLink || '').trim()
        };
        grades.push(newGrade);

        await Setting.findOneAndUpdate(
            { key: 'grades_config' },
            { value: grades },
            { upsert: true, new: true }
        );

        res.status(201).json({
            message: 'Grade created successfully',
            grade: { ...newGrade, studentCount: 0 }
        });
    } catch (error) {
        console.error("Error in createGrade:", error);
        res.status(500).json({ message: error.message });
    }
};

// PUT /students/grades/:oldGrade
exports.updateGrade = async (req, res) => {
    try {
        const oldGrade = decodeURIComponent(req.params.oldGrade).trim();
        const { name, shortCode, whatsappLink } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Grade name is required' });
        }
        const newGradeName = name.trim();

        const Setting = require('../models/Setting');
        let settingRecord = await Setting.findOne({ key: 'grades_config' });
        let grades = settingRecord && Array.isArray(settingRecord.value) ? settingRecord.value : [];

        // If grades config wasn't initialized yet, seed it with distinct grades
        if (grades.length === 0) {
            const distinct = await Student.distinct('grade');
            grades = distinct.map(g => ({ name: g, shortCode: '', whatsappLink: '' }));
        }

        // Check if new name conflicts with an existing grade (other than oldGrade)
        if (newGradeName.toLowerCase() !== oldGrade.toLowerCase()) {
            const nameConflict = grades.some(g => (g.name || g).toLowerCase() === newGradeName.toLowerCase());
            const studentConflict = await Student.findOne({ grade: newGradeName });
            if (nameConflict || studentConflict) {
                return res.status(400).json({ message: `Grade "${newGradeName}" already exists` });
            }
        }

        // Update in grades config array
        let found = false;
        grades = grades.map(g => {
            const currentName = typeof g === 'string' ? g : g.name;
            if (currentName.toLowerCase() === oldGrade.toLowerCase()) {
                found = true;
                return {
                    name: newGradeName,
                    shortCode: shortCode !== undefined ? shortCode.trim() : (g.shortCode || ''),
                    whatsappLink: whatsappLink !== undefined ? whatsappLink.trim() : (g.whatsappLink || '')
                };
            }
            return typeof g === 'string' ? { name: g, shortCode: '', whatsappLink: '' } : g;
        });

        if (!found) {
            grades.push({
                name: newGradeName,
                shortCode: (shortCode || '').trim(),
                whatsappLink: (whatsappLink || '').trim()
            });
        }

        await Setting.findOneAndUpdate(
            { key: 'grades_config' },
            { value: grades },
            { upsert: true, new: true }
        );

        // If the grade name has changed, cascade update across all collections!
        if (newGradeName !== oldGrade) {
            // 1. Update Student grade
            await Student.updateMany({ grade: oldGrade }, { $set: { grade: newGradeName } });

            // 2. Update Subject gradeSchedules
            const Subject = require('../models/Subject');
            await Subject.updateMany(
                { "gradeSchedules.grade": oldGrade },
                { "$set": { "gradeSchedules.$[elem].grade": newGradeName } },
                { arrayFilters: [{ "elem.grade": oldGrade }] }
            );

            // 3. Update Exam grade
            const Exam = require('../models/Exam');
            await Exam.updateMany({ grade: oldGrade }, { $set: { grade: newGradeName } });

            // 4. Update ClassSession grade
            const ClassSession = require('../models/ClassSession');
            await ClassSession.updateMany({ grade: oldGrade }, { $set: { grade: newGradeName } });
        }

        const studentCount = await Student.countDocuments({ grade: newGradeName });

        res.json({
            message: 'Grade updated successfully',
            grade: {
                name: newGradeName,
                shortCode: shortCode || '',
                whatsappLink: whatsappLink || '',
                studentCount
            }
        });
    } catch (error) {
        console.error("Error in updateGrade:", error);
        res.status(500).json({ message: error.message });
    }
};

// DELETE /students/grades/:grade
exports.deleteGrade = async (req, res) => {
    try {
        const gradeToDelete = decodeURIComponent(req.params.grade).trim();
        const { force } = req.query;

        const studentCount = await Student.countDocuments({ grade: gradeToDelete });
        if (studentCount > 0 && force !== 'true') {
            return res.status(400).json({
                message: `Cannot delete "${gradeToDelete}" because ${studentCount} student(s) are currently enrolled in it.`,
                studentCount
            });
        }

        const Setting = require('../models/Setting');
        let settingRecord = await Setting.findOne({ key: 'grades_config' });
        if (settingRecord && Array.isArray(settingRecord.value)) {
            settingRecord.value = settingRecord.value.filter(g => (g.name || g).toLowerCase() !== gradeToDelete.toLowerCase());
            await settingRecord.save();
        }

        // Remove from Subject grade schedules
        const Subject = require('../models/Subject');
        await Subject.updateMany(
            {},
            { $pull: { gradeSchedules: { grade: gradeToDelete } } }
        );

        res.json({ message: `Grade "${gradeToDelete}" deleted successfully` });
    } catch (error) {
        console.error("Error in deleteGrade:", error);
        res.status(500).json({ message: error.message });
    }
};

// GET /students
exports.getStudents = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, grade, subject } = req.query;
        const query = {};

        if (grade) {
            query.grade = grade;
        }

        if (subject) {
            query['enrollments.subject'] = subject;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { indexNumber: { $regex: search, $options: 'i' } },
                // Only search by grade/subject if not explicitly filtered?
                // Or keep global search. Let's keep it additive.
            ];
            // Refine search to within the selected grade/subject if provided
            if (grade || subject) {
                query.$and = [
                    ...(query.$and || []),
                    { $or: query.$or }
                ];
                delete query.$or;
            }
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

        let { indexNumber, subjects, freeCardSubjects } = req.body;

        if (!indexNumber) {
            // Auto-generate index if not provided (Simplistic approach: Timestamp based or Random)
            indexNumber = 'STU-' + Date.now().toString().slice(-6);
        }

        // Check uniqueness
        const existing = await Student.findOne({ indexNumber });
        if (existing) return res.status(400).json({ message: 'Index Number must be unique' });

        const Subject = require('../models/Subject');
        const subjectObjs = await Subject.find({ name: { $in: subjects || [] } });
        const currentYear = new Date().getFullYear();
        const enrollDate = req.body.enrolledAt ? new Date(req.body.enrolledAt) : new Date();

        const enrollments = (subjects || []).map(subjName => {
            const subjectObj = subjectObjs.find(s => s.name === subjName);
            return {
                subject: subjName,
                isFreeCard: (freeCardSubjects || []).includes(subjName),
                enrolledAt: enrollDate,
                monthlyRecords: initializeRecordsDynamic(subjectObj, req.body.grade, currentYear)
            };
        });

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
        const { subjects, freeCardSubjects, ...updateData } = req.body; // Separate subjects and freeCardSubjects from other data

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
                const Subject = require('../models/Subject');
                const newSubjectObjs = await Subject.find({ name: { $in: newSubjects } });
                const currentYear = new Date().getFullYear();

                const newEnrollments = newSubjects.map(subjName => {
                    const subjectObj = newSubjectObjs.find(s => s.name === subjName);
                    return {
                        subject: subjName,
                        isFreeCard: (freeCardSubjects || []).includes(subjName),
                        enrolledAt: new Date(),
                        monthlyRecords: initializeRecordsDynamic(subjectObj, student.grade, currentYear)
                    };
                });
                student.enrollments.push(...newEnrollments);
            }

            // 3. Update isFreeCard status and backfill enrolledAt if missing
            student.enrollments.forEach(enrollment => {
                enrollment.isFreeCard = (freeCardSubjects || []).includes(enrollment.subject);
                if (!enrollment.enrolledAt) {
                    enrollment.enrolledAt = student.createdAt || (student._id && student._id.getTimestamp ? student._id.getTimestamp() : new Date());
                }
            });
        }

        await student.save();
        res.json(student);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /students/:id
exports.deleteStudent = async (req, res) => {
    try {
        const { id } = req.params;
        const student = await Student.findByIdAndDelete(id);

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        res.json({ message: 'Student deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// PATCH /attendance/:studentId/:subject/:month/:week
exports.markAttendance = async (req, res) => {
    try {
        const { studentId, subject, month, week } = req.params; // month: 0-11, week: 0-4
        const { status } = req.body; // Expect 'present', 'absent', or 'pending'

        const student = await Student.findById(studentId);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const enrollment = student.enrollments.find(e => e.subject === subject);
        if (!enrollment) return res.status(404).json({ message: 'Subject enrollment not found' });

        const record = enrollment.monthlyRecords.find(r => r.monthIndex === parseInt(month));
        if (!record) return res.status(404).json({ message: 'Month record not found' });

        const Subject = require('../models/Subject');
        const subjectObj = await Subject.findOne({ name: subject });
        const currentYear = new Date().getFullYear();
        const actualClassDaysCount = getClassDaysCountForMonth(subjectObj, student.grade, currentYear, parseInt(month));

        if (!record.attendance || record.attendance.length === 0) {
            record.attendance = Array(actualClassDaysCount).fill('pending');
        } else if (record.attendance.length < actualClassDaysCount) {
            while (record.attendance.length < actualClassDaysCount) {
                record.attendance.push('pending');
            }
        }
        if (!record.dailyFeesPaid || record.dailyFeesPaid.length === 0) {
            record.dailyFeesPaid = Array(actualClassDaysCount).fill(false);
        } else if (record.dailyFeesPaid.length < actualClassDaysCount) {
            while (record.dailyFeesPaid.length < actualClassDaysCount) {
                record.dailyFeesPaid.push(false);
            }
        }

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

        // Register class session if marked present
        const finalStatus = record.attendance[week];
        if (finalStatus === 'present') {
            // Send WhatsApp notification
            if (student.mobile) {
                const { sendWhatsAppMessage } = require('../utils/whatsappHelper');
                const msg = `Dear Parent,
*Eduflex Institute*

Student: *${student.name}*
Index: *${student.indexNumber}*
Subject: *${subject}* (Grade ${student.grade})

Has attended the class today.
Thank you!`;
                sendWhatsAppMessage(student.mobile, msg).catch(err => {
                    console.error("[WhatsApp] Error sending manual attendance notification:", err.message);
                });
            }

            const ClassSession = require('../models/ClassSession');
            try {
                const sessionExists = await ClassSession.findOne({
                    subject,
                    grade: student.grade,
                    monthIndex: parseInt(month),
                    weekIndex: parseInt(week)
                });

                if (!sessionExists) {
                    await ClassSession.create({
                        subject,
                        grade: student.grade,
                        monthIndex: parseInt(month),
                        weekIndex: parseInt(week),
                        startTime: new Date()
                    });
                    console.log(`[ClassSession] Started session (manual mark) for ${subject} (${student.grade}) - Month ${month}, Week ${parseInt(week) + 1}`);
                }
            } catch (sessionErr) {
                console.error('[ClassSession] Error registering class session:', sessionErr.message);
            }
        }

        res.json(student);
    } catch (error) {
        console.error("Error marking attendance:", error);
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
            if (record.feePaid) {
                record.feePaidDate = new Date();
            } else {
                record.feePaidDate = null;
            }
        } else if (type === 'tute') {
            // Toggle
            console.log(`Toggling Tute: ${record.tutesGiven} -> ${!record.tutesGiven}`);
            record.tutesGiven = !record.tutesGiven;

            // Send WhatsApp notification if marked as given
            if (record.tutesGiven && student.mobile) {
                const { sendWhatsAppMessage } = require('../utils/whatsappHelper');
                const msg = `Dear Parent,
*Eduflex Institute*

Student: *${student.name}*
Index: *${student.indexNumber}*
Subject: *${subject}* (Grade ${student.grade})

Has received the Tute for this month.
Thank you!`;
                sendWhatsAppMessage(student.mobile, msg).catch(err => {
                    console.error("[WhatsApp] Error sending tute notification:", err.message);
                });
            }
        } else {
            console.log('Invalid type');
            return res.status(400).json({ message: 'Invalid type' });
        }

        // CRITICAL FIX: Ensure Mongoose knows the array inside the object has changed
        student.markModified('enrollments');
        await student.save();
        res.json(student);
    } catch (error) {
        console.error("Error updating record:", error);
        res.status(500).json({ message: error.message });
    }
};


// GET /reports/class-report
exports.getClassReport = async (req, res) => {
    try {
        const { grade, subject, month, excludeFreeCard } = req.query; // month is 0-11 index

        if (!grade || !subject || month === undefined) {
            return res.status(400).json({ message: 'Grade, Subject and Month are required' });
        }

        const monthIndex = parseInt(month);

        // Robust grade matching: handle "Grade 6" vs "Grade 06", and custom class names
        const gradeRegex = getGradeRegex(grade);

        // Find students in the grade who have the subject in enrollments
        const students = await Student.find({
            grade: { $regex: gradeRegex },
            'enrollments.subject': subject
        });

        const currentYear = new Date().getFullYear();

        let report = students.map(student => {
            const enrollment = student.enrollments.find(e => e.subject === subject);
            // Initialize Default Record if not found (or just return nulls)
            // Ideally records are initialized on creation, but for safety:
            const record = enrollment ? enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex) : null;

            const enrollDate = Student.getEnrollmentDate(enrollment, student);
            const enrollYear = enrollDate.getFullYear();
            const enrollMonth = enrollDate.getMonth();
            const notEnrolled = enrollYear > currentYear || (enrollYear === currentYear && monthIndex < enrollMonth);

            return {
                id: student._id,
                name: student.name,
                indexNumber: student.indexNumber,
                mobile: student.mobile,
                attendance: record ? record.attendance : [],
                feePaid: record ? record.feePaid : false,
                tutesGiven: record ? record.tutesGiven : false,
                isFreeCard: enrollment ? enrollment.isFreeCard : false,
                notEnrolled: notEnrolled,
                enrolledAt: enrollDate
            };
        });

        if (excludeFreeCard === 'true' || excludeFreeCard === true) {
            report = report.filter(s => !s.isFreeCard);
        }

        res.json(report);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /reports/grade-report
exports.getGradeReport = async (req, res) => {
    try {
        const { grade, month, excludeFreeCard } = req.query;

        if (!grade || month === undefined) {
            return res.status(400).json({ message: 'Grade and Month are required' });
        }

        const monthIndex = parseInt(month);
        const gradeRegex = getGradeRegex(grade);

        const students = await Student.find({ grade: { $regex: gradeRegex } });

        const currentYear = new Date().getFullYear();
        const report = {};

        students.forEach(student => {
            student.enrollments.forEach(enrollment => {
                const subject = enrollment.subject;
                const record = enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex);

                const enrollDate = Student.getEnrollmentDate(enrollment, student);
                const enrollYear = enrollDate.getFullYear();
                const enrollMonth = enrollDate.getMonth();
                const notEnrolled = enrollYear > currentYear || (enrollYear === currentYear && monthIndex < enrollMonth);

                if (!report[subject]) {
                    report[subject] = [];
                }

                report[subject].push({
                    id: student._id,
                    name: student.name,
                    indexNumber: student.indexNumber,
                    mobile: student.mobile,
                    attendance: record ? record.attendance : [],
                    feePaid: record ? record.feePaid : false,
                    tutesGiven: record ? record.tutesGiven : false,
                    isFreeCard: enrollment.isFreeCard,
                    notEnrolled: notEnrolled,
                    enrolledAt: enrollDate
                });
            });
        });

        if (excludeFreeCard === 'true' || excludeFreeCard === true) {
            Object.keys(report).forEach(sub => {
                report[sub] = report[sub].filter(s => !s.isFreeCard);
            });
        }

        res.json(report);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /reports/daily
exports.getDailyReport = async (req, res) => {
    try {
        const { date, grade, subject, excludeFreeCard } = req.query; // date: YYYY-MM-DD
        
        if (!date || !grade || !subject) {
            return res.status(400).json({ message: 'Date, Grade, and Subject are required' });
        }

        const reportDate = new Date(date);
        reportDate.setHours(0, 0, 0, 0);

        const monthIndex = reportDate.getMonth();
        const currentYear = reportDate.getFullYear();

        const Subject = require('../models/Subject');
        const subjectObj = await Subject.findOne({ name: subject });
        const classDaysCount = subjectObj?.classDaysCount || 5;
        const actualClassDaysCountForGrade = getClassDaysCountForMonth(subjectObj, grade, currentYear, monthIndex);

        // Calculate session index for the report date based on scheduled weekdays
        const schedules = subjectObj?.gradeSchedules?.filter(s => s.grade === grade) || [];
        const scheduledDays = schedules.map(s => s.day);
        
        let sessionIndex = -1;
        if (scheduledDays.length > 0) {
            const year = reportDate.getFullYear();
            const dates = [];
            const numDays = new Date(year, monthIndex + 1, 0).getDate();
            for (let day = 1; day <= numDays; day++) {
                const d = new Date(year, monthIndex, day);
                const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
                if (scheduledDays.includes(dayName)) {
                    dates.push(d);
                }
            }
            dates.sort((a, b) => a - b);
            
            sessionIndex = dates.findIndex(d => 
                d.getDate() === reportDate.getDate() && 
                d.getMonth() === reportDate.getMonth() && 
                d.getFullYear() === reportDate.getFullYear()
            );
        }
        
        let weekIndex = sessionIndex;
        if (weekIndex === -1) {
            // Fallback: calculate day of weekday occurrence
            const dayIndex = reportDate.getDay();
            let count = 0;
            const tempDate = new Date(currentYear, monthIndex, 1);
            while (tempDate <= reportDate) {
                if (tempDate.getDay() === dayIndex) {
                     count++;
                }
                tempDate.setDate(tempDate.getDate() + 1);
            }
            weekIndex = Math.max(0, count - 1);
        }

        if (weekIndex >= actualClassDaysCountForGrade) {
            weekIndex = actualClassDaysCountForGrade - 1;
        }

        const gradeRegex = getGradeRegex(grade);

        const isDailyFee = subjectObj && subjectObj.feeType === 'daily';

        const students = await Student.find({
            grade: { $regex: gradeRegex },
            'enrollments.subject': subject
        });

        const reportPromises = students.map(async student => {
            const enrollment = student.enrollments.find(e => e.subject === subject);
            const record = enrollment ? enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex) : null;
            let wasModified = false;

            if (record) {
                const actualClassDaysCount = getClassDaysCountForMonth(subjectObj, student.grade, currentYear, monthIndex);
                // Dynamic Self-Healing
                if (!record.attendance || record.attendance.length === 0) {
                    record.attendance = Array(actualClassDaysCount).fill('pending');
                    wasModified = true;
                } else if (record.attendance.length < actualClassDaysCount) {
                    while (record.attendance.length < actualClassDaysCount) {
                        record.attendance.push('pending');
                    }
                    wasModified = true;
                }
                if (!record.dailyFeesPaid || record.dailyFeesPaid.length === 0) {
                    record.dailyFeesPaid = Array(actualClassDaysCount).fill(false);
                    wasModified = true;
                } else if (record.dailyFeesPaid.length < actualClassDaysCount) {
                    while (record.dailyFeesPaid.length < actualClassDaysCount) {
                        record.dailyFeesPaid.push(false);
                    }
                    wasModified = true;
                }
            }

            if (wasModified) {
                student.markModified('enrollments');
                await student.save();
            }

            let attendanceStatus = 'pending';
            if (record && record.attendance.length > weekIndex) {
                attendanceStatus = record.attendance[weekIndex];
            }
            
            let paidToday = false;
            let feePaidStatus = false;
            
            if (isDailyFee) {
                if (record && record.dailyFeesPaid && record.dailyFeesPaid[weekIndex]) {
                    feePaidStatus = true;
                    paidToday = true;
                }
            } else {
                if (record && record.feePaid) {
                     feePaidStatus = true;
                     if (record.feePaidDate) {
                         const pd = new Date(record.feePaidDate);
                         if (pd.getFullYear() === reportDate.getFullYear() && 
                             pd.getMonth() === reportDate.getMonth() && 
                             pd.getDate() === reportDate.getDate()) {
                             paidToday = true;
                         }
                     }
                }
            }

            const enrollDate = Student.getEnrollmentDate(enrollment, student);
            const enrollDateOnly = new Date(enrollDate);
            enrollDateOnly.setHours(0, 0, 0, 0);
            const notEnrolledToday = reportDate < enrollDateOnly;

            return {
                id: student._id,
                name: student.name,
                indexNumber: student.indexNumber,
                mobile: student.mobile,
                attendanceToday: notEnrolledToday ? 'not_enrolled' : attendanceStatus, // 'present', 'absent', 'pending', true, false, 'not_enrolled'
                feePaidStatus: notEnrolledToday ? false : feePaidStatus,
                isFreeCard: enrollment ? enrollment.isFreeCard : false,
                notEnrolled: notEnrolledToday,
                paidToday: notEnrolledToday ? false : paidToday, 
                tutesGiven: record ? record.tutesGiven : false
            };
        });

        let report = await Promise.all(reportPromises);

        if (excludeFreeCard === 'true' || excludeFreeCard === true) {
            report = report.filter(s => !s.isFreeCard);
        }

        res.json({
             reportDate: reportDate,
             weekIndex: weekIndex,
             students: report 
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
// POST /attendance/qr/scan
exports.markAttendanceQR = async (req, res) => {
    try {
        const { indexNumber, subject, grade } = req.body;

        if (!indexNumber || !subject) {
            return res.status(400).json({ message: 'Index Number and Subject are required' });
        }

        const trimmedIndex = indexNumber.toString().trim();
        const student = await Student.findOne({ indexNumber: trimmedIndex });
        if (!student) {
            return res.status(404).json({ message: `Student with index "${trimmedIndex}" not found` });
        }

        // Validate Grade strictly if provided, otherwise auto-detect student.grade
        if (grade && student.grade !== grade) {
            return res.status(400).json({ message: `Student is in ${student.grade}, but selected class is for ${grade}` });
        }

        const enrollment = student.enrollments.find(e => e.subject === subject);
        if (!enrollment) {
            return res.status(404).json({ message: 'Student is not enrolled in this subject' });
        }

        // Determine Month
        const today = new Date();
        const monthIndex = today.getMonth();
        const currentYear = today.getFullYear();

        // Robust Month Record Finding
        let record = enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex);
        if (!record) {
            return res.status(404).json({ message: 'Month record not found for this month.' });
        }

        const Subject = require('../models/Subject');
        const subjectObj = await Subject.findOne({ name: subject });
        const actualClassDaysCount = getClassDaysCountForMonth(subjectObj, student.grade, currentYear, monthIndex);

        // Dynamic Self-Healing
        if (!record.attendance || record.attendance.length === 0) {
            record.attendance = Array(actualClassDaysCount).fill('pending');
        } else if (record.attendance.length < actualClassDaysCount) {
            while (record.attendance.length < actualClassDaysCount) {
                record.attendance.push('pending');
            }
        }
        if (!record.dailyFeesPaid || record.dailyFeesPaid.length === 0) {
            record.dailyFeesPaid = Array(actualClassDaysCount).fill(false);
        } else if (record.dailyFeesPaid.length < actualClassDaysCount) {
            while (record.dailyFeesPaid.length < actualClassDaysCount) {
                record.dailyFeesPaid.push(false);
            }
        }

        // Calculate session index for the report date based on scheduled weekdays
        const schedules = subjectObj?.gradeSchedules?.filter(s => s.grade === student.grade) || [];
        const scheduledDays = schedules.map(s => s.day);
        
        let sessionIndex = -1;
        if (scheduledDays.length > 0) {
            const dates = [];
            const numDays = new Date(currentYear, monthIndex + 1, 0).getDate();
            for (let day = 1; day <= numDays; day++) {
                const d = new Date(currentYear, monthIndex, day);
                const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
                if (scheduledDays.includes(dayName)) {
                    dates.push(d);
                }
            }
            dates.sort((a, b) => a - b);
            
            sessionIndex = dates.findIndex(d => 
                d.getDate() === today.getDate() && 
                d.getMonth() === today.getMonth() && 
                d.getFullYear() === today.getFullYear()
            );
        }
        
        let weekIndex = sessionIndex;
        if (weekIndex === -1) {
            // Fallback 1: Find first pending slot
            weekIndex = record.attendance.findIndex(s => s === 'pending');
            if (weekIndex === -1) {
                // Fallback 2: Calculate day of weekday occurrence
                const dayIndex = today.getDay();
                let occurrenceCount = 0;
                const tempDate = new Date(currentYear, monthIndex, 1);
                while (tempDate <= today) {
                    if (tempDate.getDay() === dayIndex) {
                        occurrenceCount++;
                    }
                    tempDate.setDate(tempDate.getDate() + 1);
                }
                weekIndex = occurrenceCount > 0 ? occurrenceCount - 1 : 0;
            }
        }

        if (weekIndex >= actualClassDaysCount) {
            weekIndex = actualClassDaysCount - 1;
        }

        // Check if already marked
        const currentStatus = record.attendance[weekIndex];
        if (currentStatus === 'present' || currentStatus === true || currentStatus === 'true') {
            return res.status(200).json({
                message: 'Attendance already marked',
                student: student.name,
                indexNumber: student.indexNumber,
                mobile: student.mobile,
                status: 'already_marked',
                week: weekIndex + 1
            });
        }

        // Mark Present
        record.attendance[weekIndex] = 'present';
        student.markModified('enrollments');
        await student.save();

        // Send WhatsApp notification
        if (student.mobile) {
            const { sendWhatsAppMessage } = require('../utils/whatsappHelper');
            const msg = `Dear Parent,
*Eduflex Institute*

Student: *${student.name}*
Index: *${student.indexNumber}*
Subject: *${subject}* (Grade ${student.grade})

Has attended the class today.
Thank you!`;
            sendWhatsAppMessage(student.mobile, msg).catch(err => {
                console.error("[WhatsApp] Error sending QR attendance notification:", err.message);
            });
        }

        // Auto-detect and register the start of this class session
        const ClassSession = require('../models/ClassSession');
        try {
            const sessionExists = await ClassSession.findOne({
                subject,
                grade: student.grade,
                monthIndex,
                weekIndex
            });

            if (!sessionExists) {
                await ClassSession.create({
                    subject,
                    grade: student.grade,
                    monthIndex,
                    weekIndex,
                    startTime: new Date()
                });
                console.log(`[ClassSession] Started session for ${subject} (${student.grade}) - Month ${monthIndex}, Week ${weekIndex + 1}`);
            }
        } catch (sessionErr) {
            console.error('[ClassSession] Error registering class session:', sessionErr.message);
        }

        res.json({
            message: 'Attendance marked successfully',
            student: student.name,
            indexNumber: student.indexNumber,
            mobile: student.mobile,
            week: weekIndex + 1,
            feePaid: Boolean(record.feePaid || enrollment.isFreeCard),
            isFreeCard: Boolean(enrollment.isFreeCard),
            status: 'success'
        });

    } catch (error) {
        console.error("QR Scan Error:", error);
        res.status(500).json({ message: error.message });
    }
};

exports.toggleDailyFeeStatus = async (req, res) => {
    try {
        const { studentId, subject, month, weekIndex } = req.params;
        const wIdx = parseInt(weekIndex);
        
        const student = await Student.findById(studentId);
        if (!student) return res.status(404).json({ message: 'Student not found' });
        
        const enrollment = student.enrollments.find(e => e.subject === subject);
        if (!enrollment) return res.status(404).json({ message: 'Subject enrollment not found' });
        
        const record = enrollment.monthlyRecords.find(r => r.monthIndex === parseInt(month));
        if (!record) return res.status(404).json({ message: 'Month record not found' });
        
        const Subject = require('../models/Subject');
        const subjectObj = await Subject.findOne({ name: subject });
        const currentYear = new Date().getFullYear();
        const actualClassDaysCount = getClassDaysCountForMonth(subjectObj, student.grade, currentYear, parseInt(month));

        if (!record.dailyFeesPaid || record.dailyFeesPaid.length === 0) {
            record.dailyFeesPaid = Array(actualClassDaysCount).fill(false);
        } else if (record.dailyFeesPaid.length < actualClassDaysCount) {
            while (record.dailyFeesPaid.length < actualClassDaysCount) {
                record.dailyFeesPaid.push(false);
            }
        }
        
        record.dailyFeesPaid[wIdx] = !record.dailyFeesPaid[wIdx];

        // Auto-mark attendance as present when daily fee is toggled to paid
        if (record.dailyFeesPaid[wIdx]) {
            if (!record.attendance || record.attendance.length === 0) {
                record.attendance = Array(actualClassDaysCount).fill('pending');
            } else if (record.attendance.length < actualClassDaysCount) {
                while (record.attendance.length < actualClassDaysCount) {
                    record.attendance.push('pending');
                }
            }
            record.attendance[wIdx] = 'present';

            // Send WhatsApp notification when fee is marked paid
            if (student.mobile) {
                const { sendWhatsAppMessage } = require('../utils/whatsappHelper');
                const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                const monthName = monthNames[parseInt(month)];
                const feeAmount = subjectObj?.fee || 0;
                
                const msg = `Dear Parent,
*Eduflex Institute*

Student: *${student.name}*
Index: *${student.indexNumber}*
Subject: *${subject}* (Grade ${student.grade})

*Day Fee Paid Successfully*
Month: *${monthName}*
Session: *Day ${wIdx + 1}*
Amount: *Rs. ${feeAmount.toFixed(2)}*

Thank you!`;
                sendWhatsAppMessage(student.mobile, msg).catch(err => {
                    console.error("[WhatsApp] Error sending daily fee toggle notification:", err.message);
                });
            }
        }
        
        student.markModified('enrollments');
        await student.save();
        
        res.json({ message: 'Daily fee status updated', dailyFeesPaid: record.dailyFeesPaid });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
