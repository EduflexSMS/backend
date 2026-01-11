const Student = require('../models/Student');
const Subject = require('../models/Subject');

exports.getDashboardStats = async (req, res) => {
    try {
        const totalStudents = await Student.countDocuments();
        const totalSubjects = await Subject.countDocuments();

        // Aggregation: Get counts and status by subject
        // We want to see how many students are enrolled in each subject
        // And for each subject, a snapshot of the current month's performance (e.g., current month index)

        // Note: This is a heavy aggregation, simplified for this prototype
        const currentDate = new Date();
        const currentMonthIndex = currentDate.getMonth();

        const subjectStats = await Student.aggregate([
            { $unwind: "$enrollments" },
            {
                $group: {
                    _id: "$enrollments.subject",
                    studentCount: { $sum: 1 },
                    // Count how many paid fees for the current month
                    paidFeesThisMonth: {
                        $sum: {
                            $cond: [
                                {
                                    $eq: [
                                        {
                                            $ifNull: [
                                                { $arrayElemAt: ["$enrollments.monthlyRecords.feePaid", currentMonthIndex] },
                                                false
                                            ]
                                        },
                                        true
                                    ]
                                }, 1, 0
                            ]
                        }
                    },
                    // Average attendance for the current month (just checking if any week attended)
                    attendedThisMonth: {
                        $sum: {
                            $cond: [
                                {
                                    $gt: [
                                        {
                                            $size: {
                                                $filter: {
                                                    input: {
                                                        $ifNull: [
                                                            { $arrayElemAt: ["$enrollments.monthlyRecords.attendance", currentMonthIndex] },
                                                            []
                                                        ]
                                                    },
                                                    as: "att",
                                                    cond: { $eq: ["$$att", true] }
                                                }
                                            }
                                        }, 0
                                    ]
                                }, 1, 0
                            ]
                        }
                    }
                }
            }
        ]);

        // Format for frontend
        // Map _id back to subject details if needed, or just send name
        const formattedSubjectStats = subjectStats.map(stat => ({
            subject: stat._id,
            studentCount: stat.studentCount,
            paidFees: stat.paidFeesThisMonth,
            activeAttendance: stat.attendedThisMonth
        }));

        res.json({
            totalStudents,
            totalSubjects,
            subjectStats: formattedSubjectStats
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
