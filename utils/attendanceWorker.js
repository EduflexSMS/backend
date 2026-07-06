const ClassSession = require('../models/ClassSession');
const Student = require('../models/Student');

// Check and mark absent students for sessions older than 2 hours
async function checkAndMarkAbsents() {
    try {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        
        // Find sessions that started more than 2 hours ago and haven't had absents marked
        const sessions = await ClassSession.find({
            absentMarked: false,
            startTime: { $lte: twoHoursAgo }
        });

        if (sessions.length === 0) return;

        console.log(`[AttendanceWorker] Found ${sessions.length} sessions to mark as absent.`);

        for (const session of sessions) {
            const { subject, grade, monthIndex, weekIndex } = session;
            console.log(`[AttendanceWorker] Processing: ${subject} (${grade}) - Month ${monthIndex}, Week ${weekIndex + 1}`);

            const gradeNum = parseInt(grade.replace(/\D/g, ''));
            const gradeRegex = isNaN(gradeNum)
                ? new RegExp(`^${grade.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i')
                : new RegExp(`^Grade 0?${gradeNum}$`, 'i');

            // Find all students in this grade who are enrolled in this subject
            const students = await Student.find({
                grade: { $regex: gradeRegex },
                'enrollments.subject': subject
            });

            let absentCount = 0;

            for (const student of students) {
                const enrollment = student.enrollments.find(e => e.subject === subject);
                if (!enrollment) continue;

                const record = enrollment.monthlyRecords.find(r => r.monthIndex === monthIndex);
                if (!record) continue;

                // Ensure attendance array has enough elements
                while (record.attendance.length <= weekIndex) {
                    record.attendance.push('pending');
                }

                // If status is still 'pending', mark as 'absent'
                if (record.attendance[weekIndex] === 'pending') {
                    record.attendance[weekIndex] = 'absent';
                    student.markModified('enrollments');
                    try {
                        await student.save();
                        absentCount++;
                    } catch (saveErr) {
                        console.error(`[AttendanceWorker] Failed to save student ${student.indexNumber}:`, saveErr.message);
                    }
                }
            }

            // Mark session as processed
            session.absentMarked = true;
            await session.save();

            console.log(`[AttendanceWorker] Completed: Marked ${absentCount} students as absent for ${subject} (${grade}).`);
        }
    } catch (err) {
        console.error('[AttendanceWorker] Error in checkAndMarkAbsents:', err);
    }
}

// Start the background worker (runs every 5 minutes)
function startAttendanceWorker() {
    console.log('[AttendanceWorker] Background worker started.');
    // Run immediately on start
    checkAndMarkAbsents();
    // Then run every 5 minutes
    setInterval(checkAndMarkAbsents, 5 * 60 * 1000);
}

module.exports = {
    checkAndMarkAbsents,
    startAttendanceWorker
};
