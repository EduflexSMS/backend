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
                                    $gt: [
                                        {
                                            $size: {
                                                $filter: {
                                                    input: "$enrollments.monthlyRecords",
                                                    as: "record",
                                                    cond: {
                                                        $and: [
                                                            { $eq: ["$$record.monthIndex", currentMonthIndex] },
                                                            { $eq: ["$$record.feePaid", true] }
                                                        ]
                                                    }
                                                }
                                            }
                                        },
                                        0
                                    ]
                                }, 1, 0
                            ]
                        }
                    },
                    // Active Attendance (at least one day present in current month)
                    attendedThisMonth: {
                        $sum: {
                            $cond: [
                                {
                                    $gt: [
                                        {
                                            $size: {
                                                $filter: {
                                                    input: "$enrollments.monthlyRecords",
                                                    as: "record",
                                                    cond: {
                                                        $and: [
                                                            { $eq: ["$$record.monthIndex", currentMonthIndex] },
                                                            { $in: ["$$record.attendance", ["present", true, "true"]] } // Check if any present/true
                                                        ]
                                                    }
                                                }
                                            }
                                        },
                                        0
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
