/**
 * Calculates the number of times specified weekdays occur in a given month.
 * Optionally respects a start date for each weekday.
 * 
 * @param {number} year 
 * @param {number} monthIndex - 0-indexed (0 = Jan, 11 = Dec)
 * @param {string[]} scheduledDays - e.g., ['Wednesday', 'Sunday']
 * @param {object[]} schedules - Optional schedule objects containing startDate
 * @returns {number}
 */
const getDaysCount = (year, monthIndex, scheduledDays, schedules = []) => {
    const date = new Date(year, monthIndex, 1);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const startDatesMap = {};
    schedules.forEach(s => {
        if (s.startDate) {
            startDatesMap[s.day] = new Date(s.startDate);
            startDatesMap[s.day].setHours(0, 0, 0, 0);
        }
    });
    
    let count = 0;
    while (date.getMonth() === monthIndex) {
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

/**
 * Dynamically calculates the number of class days for a given subject and grade in a specific month and year.
 * 
 * @param {object} subjectObj - Subject document
 * @param {string} grade - e.g., 'Grade 12'
 * @param {number} year 
 * @param {number} monthIndex - 0-indexed (0 = Jan, 11 = Dec)
 * @returns {number}
 */
const getClassDaysCountForMonth = (subjectObj, grade, year, monthIndex) => {
    if (!subjectObj) return 5;
    const schedules = subjectObj.gradeSchedules?.filter(s => s.grade === grade) || [];
    if (schedules.length === 0) {
        // Fallback to default classDay if no gradeSchedules match
        const defaultDay = subjectObj.classDay || 'Monday';
        return getDaysCount(year, monthIndex, [defaultDay]);
    }
    const scheduledDays = schedules.map(s => s.day);
    return getDaysCount(year, monthIndex, scheduledDays, schedules);
};

module.exports = {
    getDaysCount,
    getClassDaysCountForMonth
};
