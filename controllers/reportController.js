const Student = require('../models/Student');
const ExcelJS = require('exceljs');

// Helper to get month name
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

exports.generateMonthlyReport = async (req, res) => {
    try {
        const { subject, grade, month } = req.query; // month is 0-11

        if (!subject || !grade || month === undefined) {
            return res.status(400).json({ message: 'Subject, Grade and Month are required' });
        }

        const monthIndex = parseInt(month);

        // Find students match grade and have subject enrollment
        const students = await Student.find({
            grade: grade,
            'enrollments.subject': subject
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`${subject} - Grade ${grade} - ${months[monthIndex]}`);

        // Columns
        worksheet.columns = [
            { header: 'Index Number', key: 'index', width: 15 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Mobile', key: 'mobile', width: 15 },
            { header: 'Fee Paid', key: 'fee', width: 10 },
            { header: 'Tutes Given', key: 'tute', width: 12 },
            { header: 'Week 1', key: 'w1', width: 10 },
            { header: 'Week 2', key: 'w2', width: 10 },
            { header: 'Week 3', key: 'w3', width: 10 },
            { header: 'Week 4', key: 'w4', width: 10 },
        ];

        students.forEach(student => {
            const enrollment = student.enrollments.find(e => e.subject === subject);
            if (enrollment) {
                const record = enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex);
                if (record) {
                    worksheet.addRow({
                        index: student.indexNumber,
                        name: student.name,
                        mobile: student.mobile,
                        fee: record.feePaid ? 'Yes' : 'No',
                        tute: record.tutesGiven ? 'Yes' : 'No',
                        w1: record.attendance[0] ? 'P' : 'A',
                        w2: record.attendance[1] ? 'P' : 'A',
                        w3: record.attendance[2] ? 'P' : 'A',
                        w4: record.attendance[3] ? 'P' : 'A',
                    });
                }
            }
        });

        // Style header
        worksheet.getRow(1).font = { bold: true };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Report_${subject}_Grade${grade}_${months[monthIndex]}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to generate report' });
    }
};
