/**
 * Slot generation and availability calculation utility
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Returns the weekday (0=Sun, 1=Mon, ..., 6=Sat) for a YYYY-MM-DD string in a timezone.
 */
export function getWeekdayInTimezone(dateStr, timezone = 'Asia/Kolkata') {
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  // Use noon UTC to avoid edge-of-day timezone shifts
  const d = new Date(`${dateStr}T12:00:00Z`);
  const weekdayShort = formatter.format(d);
  return weekdayMap[weekdayShort];
}

/**
 * Returns today's date string in YYYY-MM-DD format in a timezone.
 */
export function getTodayInTimezone(timezone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

/**
 * Returns current time string in HH:mm format in a timezone.
 */
export function getCurrentTimeInTimezone(timezone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

/**
 * Converts a Date to YYYY-MM-DD in a timezone.
 */
export function formatDateInTimezone(date, timezone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
}

/**
 * Converts a Date to HH:mm in a timezone.
 */
export function formatTimeInTimezone(date, timezone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Generates available 15-minute slots for a doctor on a given date.
 *
 * @param {Object} params
 * @param {string} params.dateStr - YYYY-MM-DD
 * @param {Array} params.availabilities - Doctor's Availability documents
 * @param {Array} params.appointments - Conflicting appointments (status in awaiting_payment, paid, in_progress)
 * @param {string} [params.timezone='Asia/Kolkata'] - Doctor's timezone
 * @param {number} [params.slotDurationMin=15] - Duration of each slot in minutes
 * @param {Date} [params.currentDateForTest] - Optional mock current date for deterministic testing
 * @returns {Array<string>} List of slot start times (e.g. ['09:00', '09:15'])
 */
export function computeAvailableSlots({
  dateStr,
  availabilities,
  appointments = [],
  timezone = 'Asia/Kolkata',
  slotDurationMin = 15,
  currentDateForTest = null,
}) {
  const todayStr = currentDateForTest
    ? new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(currentDateForTest)
    : getTodayInTimezone(timezone);

  // If requested date is in the past, no slots are available
  if (dateStr < todayStr) {
    return [];
  }

  // Check if dateStr matches any exception dates in the doctor's availability
  for (const avail of availabilities) {
    if (avail.exceptions && Array.isArray(avail.exceptions)) {
      for (const exc of avail.exceptions) {
        const excStr = exc instanceof Date ? formatDateInTimezone(exc, timezone) : String(exc).slice(0, 10);
        if (excStr === dateStr) {
          return []; // Doctor took leave / exception on this date
        }
      }
    }
  }

  const weekday = getWeekdayInTimezone(dateStr, timezone);
  const matchingAvailabilities = availabilities.filter((a) => a.weekday === weekday);
  if (matchingAvailabilities.length === 0) {
    return [];
  }

  // Generate candidate slots from all ranges for this weekday
  const candidateSlots = new Set();
  for (const avail of matchingAvailabilities) {
    const [startH, startM] = avail.startTime.split(':').map(Number);
    const [endH, endM] = avail.endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    for (let m = startMinutes; m + slotDurationMin <= endMinutes; m += slotDurationMin) {
      const slotTime = `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
      candidateSlots.add(slotTime);
    }
  }

  // Determine booked slot ranges from existing appointments
  const bookedSlots = new Set();
  for (const appt of appointments) {
    if (!appt.scheduledAt) continue;
    const apptDateStr = formatDateInTimezone(appt.scheduledAt, timezone);
    if (apptDateStr !== dateStr) continue;

    const [appH, appM] = formatTimeInTimezone(appt.scheduledAt, timezone).split(':').map(Number);
    const apptStartMin = appH * 60 + appM;
    const duration = appt.durationMin || slotDurationMin;
    const apptEndMin = apptStartMin + duration;

    // Any candidate slot that overlaps with this appointment range is booked
    for (let m = apptStartMin; m < apptEndMin; m += slotDurationMin) {
      const bookedTime = `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
      bookedSlots.add(bookedTime);
    }
  }

  // Filter candidate slots
  const sortedSlots = Array.from(candidateSlots).sort();
  const availableSlots = [];

  const currentTimeStr = currentDateForTest
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(currentDateForTest)
    : getCurrentTimeInTimezone(timezone);

  for (const slot of sortedSlots) {
    // If date is today, exclude past slots
    if (dateStr === todayStr && slot <= currentTimeStr) {
      continue;
    }
    // Exclude booked slots
    if (bookedSlots.has(slot)) {
      continue;
    }
    availableSlots.push(slot);
  }

  return availableSlots;
}
