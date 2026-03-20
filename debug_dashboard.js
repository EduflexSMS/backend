const mongoose = require('mongoose');
const Student = require('./models/Student');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB');
        try {
            const currentDate = new Date();
            const currentMonthIndex = currentDate.getMonth();
            console.log('Current Month Index:', currentMonthIndex);

            const result = await Student.aggregate([
                { $unwind: "$enrollments" },
                {
                    $group: {
                        _id: "$enrollments.subject",
                        studentCount: { $sum: 1 },
                        paidFeesThisMonth: {
                            $sum: {
                                $cond: [
                                    {
                                        $eq: [
                                            { $arrayElemAt: ["$enrollments.monthlyRecords.feePaid", currentMonthIndex] },
                                            true
                                        ]
                                    }, 1, 0
                                ]
                            }
                        }
                    }
                }
            ]);
            console.log('Aggregation Result:', JSON.stringify(result, null, 2));
        } catch (err) {
            console.error('Aggregation Error:', err);
        } finally {
            mongoose.disconnect();
        }
    })
    .catch(err => console.error('Connection Error:', err));
