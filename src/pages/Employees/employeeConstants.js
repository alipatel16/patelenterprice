// src/pages/Employees/employeeConstants.js

export const ALL_PAGES = [
  { path: '/dashboard',         label: 'Dashboard' },
  { path: '/customers',         label: 'Customers' },
  { path: '/products',          label: 'Products' },
  { path: '/purchases',         label: 'Purchases' },
  { path: '/inventory',         label: 'Inventory' },
  { path: '/sales',             label: 'Sales' },
  { path: '/delivery-tracking', label: 'Delivery Tracking' },
  { path: '/exchange-tracking', label: 'Exchange Tracking' },
  { path: '/emi-dues',          label: 'EMI Dues' },
  { path: '/quotations',        label: 'Quotations' },
  { path: '/gift-invoices',     label: 'Gift Invoices' },
  { path: '/gift-sets',         label: 'Gift Sets' },
  { path: '/complaints',        label: 'Complaints' },
  { path: '/brand-hierarchy',   label: 'Brand Hierarchy' },
  { path: '/employees',         label: 'Employees' },
  { path: '/attendance',        label: 'Attendance Tracker' },
  { path: '/checklist-templates', label: 'Checklist Templates' },
];

/** Geofence: store → list of allowed centre-points */
export const LOCATION_CONFIGS = {
  electronics: [
    { lat: 23.126824, lng: 72.048638, label: 'Electronics Store 1' },
    { lat: 23.133828, lng: 72.038712, label: 'Electronics Store 2' },
  ],
  furniture: [
    { lat: 23.133828, lng: 72.038712, label: 'Furniture Store 1' },
    { lat: 23.125135, lng: 72.044948, label: 'Furniture Store 2' },
  ],
};

export const LOCATION_RADIUS_METERS = 100;

export const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

/** Haversine distance in metres */
export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dphi  = ((lat2 - lat1) * Math.PI) / 180;
  const dlam  = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinAllowedLocation(lat, lng, storeType) {
  const locations = LOCATION_CONFIGS[storeType] || LOCATION_CONFIGS.electronics;
  return locations.some(
    (loc) => getDistanceMeters(lat, lng, loc.lat, loc.lng) <= LOCATION_RADIUS_METERS
  );
}

export function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

export function formatTime(isoStr) {
  if (!isoStr) return '--';
  return new Date(isoStr).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const diff = new Date(endIso) - new Date(startIso);
  const hrs  = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

/** Generate checklist instances for a user based on their assigned templates */
export function shouldGenerateChecklist(template, dateStr) {
  const date = new Date(dateStr);
  const dow  = date.getDay();   // 0=Sun … 6=Sat
  const dom  = date.getDate();  // 1-31
  if (template.occurrenceType === 'daily')   return true;
  if (template.occurrenceType === 'weekly')  return template.dayOfWeek === dow;
  if (template.occurrenceType === 'monthly') return template.dayOfMonth === dom;
  return false;
}