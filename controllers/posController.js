const Transaction = require('../models/Transaction');
const Student = require('../models/Student');
const axios = require('axios');

exports.processCheckout = async (req, res) => {
    try {
        const { studentId, items, totalAmount } = req.body;

        if (!studentId || !items || items.length === 0) {
            return res.status(400).json({ message: 'Missing required checkout information.' });
        }

        const student = await Student.findById(studentId);
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }

        // 1. Update Student's feePaid statuses
        items.forEach(item => {
            const enrollment = student.enrollments.find(e => e.subject === item.subject);
            if (enrollment) {
                const record = enrollment.monthlyRecords.find(r => r.monthIndex === item.month);
                if (record) {
                    if (item.weekIndex !== undefined) {
                        if (!record.dailyFeesPaid) {
                            record.dailyFeesPaid = [false, false, false, false, false];
                        }
                        record.dailyFeesPaid[item.weekIndex] = true;
                    } else {
                        record.feePaid = true;
                        record.feePaidDate = new Date();
                    }
                }
            }
        });

        // Ensure Mongoose detects the nested array update
        student.markModified('enrollments');
        await student.save();

        // 2. Create Transaction Record
        // Generate a random TXN ID, e.g., TXN-1718292837-ABCD
        const transactionId = 'TXN-' + Date.now().toString().slice(-6) + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

        const transaction = new Transaction({
            transactionId,
            studentId: student._id,
            studentName: student.name,
            indexNumber: student.indexNumber,
            items,
            totalAmount
        });

        await transaction.save();

        // 3. Prepare WhatsApp Message
        let waMessage = `✅ *Payment Receipt - Eduflex*\n---------------------------------\n`;
        waMessage += `*Name:* ${student.name}\n`;
        waMessage += `*Index:* ${student.indexNumber}\n`;
        waMessage += `*Receipt No:* ${transactionId}\n`;
        waMessage += `*Date:* ${new Date().toLocaleDateString()}\n\n`;
        waMessage += `*Paid Subjects:*\n`;
        items.forEach(item => {
            const weekText = item.weekName ? ` - ${item.weekName}` : '';
            waMessage += `- ${item.subject} (${item.monthName}${weekText}): Rs. ${item.amount}\n`;
        });
        waMessage += `\n*Total Paid: Rs. ${totalAmount.toFixed(2)}*\n---------------------------------\n`;
        waMessage += `Thank you!\nEduflex Institute\nContact: +94789232752`;

        // We return the message so the frontend can send it via the ultramsg API endpoint
        // This is better than doing it here directly because the frontend might want to handle the loading state or fallback
        // However, since we want it "automatic", we can also do it directly here. But let's do it here directly for robust backend fulfillment.
        
        const instanceId = process.env.ULTRAMSG_INSTANCE_ID;
        const token = process.env.ULTRAMSG_TOKEN;
        
        let waStatus = 'skipped';
        
        if (student.mobile && instanceId && token) {
             let finalMobile = student.mobile.replace('+', '').trim();
             const formattedMobile = finalMobile + '@c.us';
             const params = new URLSearchParams();
             params.append('token', token);
             params.append('to', formattedMobile);
             params.append('body', waMessage);

             try {
                 await axios.post(`https://api.ultramsg.com/${instanceId}/messages/chat`, params);
                 waStatus = 'sent';
             } catch (waError) {
                 console.error("WhatsApp sending failed during checkout:", waError.message);
                 waStatus = 'failed';
             }
        }

        res.status(200).json({
            message: 'Checkout successful',
            transaction,
            waStatus
        });

    } catch (error) {
        console.error("Checkout Error:", error);
        res.status(500).json({ message: error.message });
    }
};
