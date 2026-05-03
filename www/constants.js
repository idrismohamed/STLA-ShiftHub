// 28-day rotation pattern: D=Day, N=Night, O=Off
const PATTERN = ['D','D','O','O','N','N','N','O','O','D','D','O','O','O','N','N','O','O','D','D','D','O','O','N','N','O','O','O'];

const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const daysOfWeek = ["Fri","Sat","Sun","Mon","Tue","Wed","Thu"];

// Time constants (milliseconds)
const MS_DAY = 86400000;
const MS_PP  = 1209600000; // 14-day pay period
const MS_PP_TO_END = 1123200000; // 13 days — offset from PP start to PP end date

// Pay-period anchor: the known PP start date used to calculate all PP indexes
const basePPStartUTC = Date.UTC(2025, 11, 19);

// localStorage key names — change version suffix here if you need to reset stored data
const STORAGE_KEYS = {
    SHIFTS:        'kingDrewShiftsV20',
    SETTINGS:      'kingDrewSettingsV20',
    ROTATION:      'kingDrewRotationV20',
    SYNCED_EVENTS: 'kingDrewSyncedEventsV20'
};

// Glow shadows for each time-off type used on form buttons
const TIMEOFF_GLOWS = {
    Vacation: '0 4px 10px rgba(0, 188, 212, 0.3)',
    Off:      '0 4px 10px rgba(234, 67, 53, 0.3)',
    Lieu:     '0 4px 10px rgba(251, 188, 4, 0.3)',
    DropOff:  '0 4px 10px rgba(66, 133, 244, 0.3)',
    DropPaid: '0 4px 10px rgba(52, 168, 83, 0.3)'
};
