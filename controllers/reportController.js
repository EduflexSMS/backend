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

        const Subject = require('../models/Subject');
        const subjectObj = await Subject.findOne({ name: subject });
        const isDailyFee = subjectObj && subjectObj.feeType === 'daily';

        // Robust grade matching: handle "Grade 6" vs "Grade 06", and custom class names
        const gradeNum = parseInt(grade.replace(/\D/g, ''));
        const gradeRegex = isNaN(gradeNum)
            ? new RegExp(`^${grade.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i')
            : new RegExp(`^Grade 0?${gradeNum}$`, 'i');

        // Find students match grade and have subject enrollment
        const students = await Student.find({
            grade: { $regex: gradeRegex },
            'enrollments.subject': subject
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`${subject} - Grade ${grade} - ${months[monthIndex]}`);

        const classDaysCount = subjectObj?.classDaysCount || 5;

        // Columns
        const columns = [
            { header: 'Index Number', key: 'index', width: 15 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Mobile', key: 'mobile', width: 15 },
            { header: 'Fee Paid', key: 'fee', width: 10 },
            { header: 'Tutes Given', key: 'tute', width: 12 }
        ];

        for (let i = 0; i < classDaysCount; i++) {
            columns.push({ header: `Day ${i + 1}`, key: `d${i + 1}`, width: 10 });
        }
        worksheet.columns = columns;

        students.forEach(student => {
            const enrollment = student.enrollments.find(e => e.subject === subject);
            if (enrollment) {
                const record = enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex);
                if (record) {
                    let feeStatus = record.feePaid ? 'Yes' : 'No';
                    if (enrollment.isFreeCard) {
                        feeStatus = 'Free Card';
                    } else if (isDailyFee) {
                        const paidDays = record.dailyFeesPaid ? record.dailyFeesPaid.filter(Boolean).length : 0;
                        feeStatus = `${paidDays} paid`;
                    }

                    const rowData = {
                        index: student.indexNumber,
                        name: student.name,
                        mobile: student.mobile,
                        fee: feeStatus,
                        tute: record.tutesGiven ? 'Yes' : 'No'
                    };

                    for (let i = 0; i < classDaysCount; i++) {
                        const status = record.attendance[i];
                        rowData[`d${i + 1}`] = (status === true || status === 'present') ? 'P' : (status === 'absent' ? 'Ab' : 'A');
                    }
                    worksheet.addRow(rowData);
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
