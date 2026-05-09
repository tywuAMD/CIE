function pad2(value) {
    return String(value).padStart(2, '0');
}

function parseTimeToMinutes(time) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time || '');
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return (hours * 60) + minutes;
}

function minutesToTime(minutes) {
    const safeMinutes = minutes % (24 * 60);
    const hours = Math.floor(safeMinutes / 60);
    const mins = safeMinutes % 60;
    return `${pad2(hours)}:${pad2(mins)}`;
}

function buildHourlySlots(date, startTime, durationHours) {
    const startMinutes = parseTimeToMinutes(startTime);
    if (startMinutes === null) return null;
    if (!Number.isInteger(durationHours) || durationHours <= 0) return null;

    const endMinutes = startMinutes + (durationHours * 60);
    if (endMinutes >= 24 * 60) return null;

    const slots = [];
    for (let i = 0; i < durationHours; i += 1) {
        const slotMinutes = startMinutes + (i * 60);
        if (slotMinutes >= 24 * 60) return null;

        const slotTime = minutesToTime(slotMinutes);
        slots.push(`${date} ${slotTime}:00`);
    }

    return slots;
}

module.exports = {
    parseTimeToMinutes,
    minutesToTime,
    buildHourlySlots
};
