// Define TimeSlot
class TimeSlot {
    constructor(day, period) {
        this.day = day;
        this.period = period;
    }
}

// Define Course
class Course {
    constructor(id, name, teacher, section, lectures, priority, prefs) {
        this.id = id;
        this.name = name;
        this.teacher = teacher;
        this.section = new Set(section);
        this.lectures = lectures;
        this.priority = priority;
        this.prefs = prefs;
        this.conflicts = 0;
    }
}

// Main scheduler function
function scheduler(courses, days, rooms, unavail) {
    try {
        // Initialize schedule
        let schedule = {};
        for (let period = 1; period <= Math.floor(1000 / days); period++) {
            for (let day = 1; day <= days; day++) {
                schedule[`${day}.${period}`] = [];
            }
        }

        // Sort courses based on conflicts
        calculateConflicts(courses, unavail);
        courses.sort((a, b) => a.priority - b.priority || b.conflicts - a.conflicts || a.id - b.id);

        // Add courses to schedule via greedy coloring
        let [updatedSchedule, periods, unassigned] = assignCourses(courses, schedule, rooms, unavail);
        
        let error = unassigned.length > 0 ? "Unable to schedule all classes." : null;
        
        return [updatedSchedule, periods, unassigned, error];
    } catch (e) {
        return [{}, 0, [], `An unexpected error occurred during scheduling: ${e.message}`];
    }
}

function calculateConflicts(courses, unavail) {
    if (unavail) {
        for (let course of courses) {
            course.conflicts = courses.reduce((sum, other) => 
                other !== course && conflict(course, other) ? sum + 2 : sum, 0);
            course.conflicts += (unavail[course.teacher] || []).length;
        }
    } else {
        for (let course of courses) {
            course.conflicts = courses.reduce((sum, other) => 
                other !== course && conflict(course, other) ? sum + 1 : sum, 0);
        }
    }
}

function assignCourses(courses, schedule, rooms, unavail) {
    let periods = 0;
    let unassigned = [];

    function assign(course, slot) {
        if (rooms && schedule[slot].length === rooms) return false;
        if (unavail && unavail[course.teacher] && unavail[course.teacher].includes(slot)) return false;
        for (let scheduled of schedule[slot]) {
            if (conflict(course, scheduled)) return false;
        }
        schedule[slot].push(course);
        periods = Math.max(periods, parseInt(slot.split('.')[1]));
        return true;
    }

    for (let course of courses) {
        let allotted = 0;
        // Attempt allocating to prefs if given
        if (course.prefs.length > 0) {
            for (let slot of course.prefs) {
                if (assign(course, slot)) {
                    allotted++;
                    if (allotted >= course.lectures) break;
                }
            }
        }
        // If needed attempt allocating to other slots
        if (allotted < course.lectures) {
            for (let slot in schedule) {
                if (!course.prefs.includes(slot)) {
                    if (assign(course, slot)) {
                        allotted++;
                        if (allotted >= course.lectures) break;
                    }
                }
            }
        }
        // If all lectures not allotted, add course to unassigned
        if (allotted < course.lectures) {
            unassigned.push(course);
        }
    }
    return [schedule, periods, unassigned];
}

function conflict(course1, course2) {
    return course1.teacher === course2.teacher || 
           [...course1.section].some(section => course2.section.has(section));
}

function parseTimeslots(slotsStr) {
    if (!slotsStr) return [];
    return slotsStr.split(',').map(slot => slot.trim()).filter(Boolean);
}

document.getElementById('schedulerForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const scheduleTable = document.getElementById('scheduleTable');
    if (scheduleTable) {
        scheduleTable.remove();
    }
    document.getElementById('errorContainer').innerHTML = ''

    const days = parseInt(document.getElementById('days').value);
    const rooms = parseInt(document.getElementById('rooms').value) || null;
    const coursesFile = document.getElementById('courses').files[0];
    const unavailFile = document.getElementById('unavailability').files[0];
    document.getElementById('scheduleContainer').style.display = 'block';

    if (days < 1 || days > 7 || (rooms !== null && rooms < 1)) {
        displayError("Invalid value for days or rooms");
        return;
    }

    Promise.all([
        readCSV(coursesFile),
        unavailFile ? readCSV(unavailFile) : Promise.resolve(null)
    ]).then(([coursesData, unavailData]) => {
        const courses = processCourses(coursesData);
        const unavail = processUnavailability(unavailData);

        const [schedule, periods, unassigned, error] = scheduler(courses, days, rooms, unavail);

        if (error) {
            displayError(error);
        }

        displaySchedule(schedule, days, periods);
        displayUnassigned(unassigned);
        
        // Hide instructions and show the "View Instructions" button
        document.getElementById('ins').style.display = 'none';
        document.getElementById('ins-btn').style.display = 'block';
        document.getElementById('footer').style.display = 'block';
    }).catch(error => {
        displayError(`Error processing files: ${error.message}`);
    });
});

function readCSV(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            complete: function(results) {
                resolve(results.data);
            },
            error: function(error) {
                reject(error);
            }
        });
    });
}

function processCourses(data) {
    // Filter out empty rows and rows with all empty values
    return data.filter(row => Object.keys(row).length > 0 && Object.values(row).some(value => value.trim() !== '')).map((row, index) => {
        // Check if required fields exist and have values
        if (!row.course || !row.teacher || !row.section) {
            console.warn("Missing required fields in row:", row);
            throw new Error('Missing required fields in course data. Required fields: course, teacher, section, lectures');
        }

        // Determine the priority based on whether slot is given
        const priority = row.slots && row.slots.trim() !== '' ? 1 : 2;

        return new Course(
            index,
            row.course.trim(),
            row.teacher.trim(),
            row.section.split(',').map(s => s.trim()),
            parseInt(row.lectures) || 1,
            priority,
            parseTimeslots(row.slots || '')
        );
    });
}


function processUnavailability(data) {
    if (!data) return null;
    let unavail = {};
    for (let row of data) {
        if (row.teacher && row.slots) {
            unavail[row.teacher.trim()] = parseTimeslots(row.slots);
        }
    }
    return unavail;
}

function displaySchedule(schedule, days, periods) {
    const container = document.getElementById('scheduleContainer');

    const table = document.createElement('table');
    table.className = 'box';
    table.id = 'scheduleTable';
    const headerRow = table.insertRow();
    const periodHeader = headerRow.insertCell();
    periodHeader.outerHTML = '<th><small>Period<small></th>';
    
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (let day = 1; day <= days; day++) {
        const dayHeader = headerRow.insertCell();
        dayHeader.outerHTML = `<th>${dayNames[day - 1]}</th>`;
    }

    for (let period = 1; period <= periods; period++) {
        const row = table.insertRow();
        const periodCell = row.insertCell();
        periodCell.outerHTML = `<th>${period}</th>`;
        for (let day = 1; day <= days; day++) {
            const cell = row.insertCell();
            const slot = `${day}.${period}`;
            const courses = schedule[slot];
            if (courses.length > 0) {
                const ul = document.createElement('ul');
                courses.forEach(course => {
                    const li = document.createElement('li');
                    li.innerHTML = `${[...course.section].join(', ')} - ${course.name}<br><small>(${course.teacher})</small>`;
                    ul.appendChild(li);
                });
                cell.appendChild(ul);
            }
        }
    }

    container.appendChild(table);
}

function displayUnassigned(unassigned) {
    const container = document.getElementById('unassignedContainer');
    container.innerHTML = '';
    if (unassigned.length > 0) {
        container.innerHTML = '<h2>Unassigned Courses</h2><ul>' + 
            unassigned.map(course => `<li>${course.name} (${course.teacher})</li>`).join('') + 
            '</ul>';
    }
}

function displayError(message) {
    const container = document.getElementById('errorContainer');
    container.innerHTML = `<div class="box"><h2>Error</h2><p>${message}</p></div>`;
    document.getElementById('scheduleContainer').style.display = 'none';
}

function toggleInstructions() {
    const instructions = document.getElementById('ins');
    if (instructions.style.display === 'none') {
        instructions.style.display = 'block';
    } else {
        instructions.style.display = 'none';
    }
}

function toggleAbout() {
    const element = document.getElementById('about');
    if (element.style.display === 'none') {
        element.style.display = 'block';
    } else {
        element.style.display = 'none';
    }
}
