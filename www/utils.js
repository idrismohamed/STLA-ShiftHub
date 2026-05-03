/**
 * Safe JSON parse from localStorage. Returns fallback on missing or corrupt data.
 * @param {string} key
 * @param {*} fallback
 */
function safeParse(key, fallback) {
    try {
        const v = localStorage.getItem(key);
        if (v === null) return fallback;
        const parsed = JSON.parse(v);
        return parsed == null ? fallback : parsed;
    } catch (e) {
        console.warn(`Failed to parse localStorage key "${key}":`, e);
        return fallback;
    }
}

/**
 * Convert a UTC millisecond timestamp to a YYYY-MM-DD date key string.
 * @param {number} utcMs
 * @returns {string}
 */
function toDateKey(utcMs) {
    const d = new Date(utcMs);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Parse "HH:MM" time string to a float (e.g. "06:30" → 6.5).
 * @param {string} t
 * @returns {number}
 */
function getFloatTime(t) {
    if (!t) return 0;
    const [h, m] = t.split(':');
    return parseInt(h) + (parseInt(m) / 60);
}

/**
 * Hours between two "HH:MM" strings. Handles overnight spans (end < start).
 * @param {string} s  start time
 * @param {string} e  end time
 * @returns {number}
 */
function getDuration(s, e) {
    let st = getFloatTime(s), et = getFloatTime(e);
    if (et < st) et += 24;
    return et - st;
}

/**
 * Format "HH:MM" 24-hour string to "H:MM AM/PM".
 * @param {string} timeStr
 * @returns {string}
 */
function formatTime12(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    let hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${m} ${ampm}`;
}

/**
 * Add months to a UTC millisecond timestamp.
 * @param {number} utcMs
 * @param {number} months
 * @returns {number}
 */
function addMonths(utcMs, months) {
    const d = new Date(utcMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate());
}

/**
 * Normalize legacy crew labels — e.g. "D Shift" → "D".
 * @param {string} crew
 * @returns {string}
 */
function normalizeCrew(crew) {
    if (!crew) return crew;
    if (crew === 'OT' || /^[A-D]$/.test(crew)) return crew;
    if (typeof crew === 'string' && crew.endsWith(' Shift')) return crew.charAt(0);
    return crew;
}

/**
 * Format a crew letter to its display label (e.g. "D" → "D Shift").
 * @param {string} crew
 * @returns {string}
 */
function formatCrewLabel(crew) {
    if (!crew) return '';
    if (crew === 'OT') return 'OT';
    if (typeof crew === 'string' && crew.endsWith(' Shift')) return crew;
    return crew + ' Shift';
}
