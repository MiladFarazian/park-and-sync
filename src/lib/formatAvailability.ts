export const formatAvailability = (rules: any[]) => {
  if (!rules || rules.length === 0) return 'No schedule set';
  
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const availableDays = [...new Set(rules.filter(r => r.is_available).map(r => r.day_of_week))];
  
  if (availableDays.length === 0) return 'Unavailable';
  if (availableDays.length === 7) {
    // Check if all days are 24/7
    const is247 = rules.every(r => r.start_time === '00:00' && r.end_time === '23:59');
    if (is247) return 'Available 24/7';
  }
  
  // Group consecutive days
  availableDays.sort((a, b) => a - b);
  return availableDays.map(d => DAYS[d]).join(', ');
};
