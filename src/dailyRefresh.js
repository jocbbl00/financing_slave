// A daily edition starts at noon in New York, including daylight saving time.
export function getEtRotationDayNumber(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const pick = type => Number(parts.find(part => part.type === type).value);
  const day = Math.floor(Date.UTC(pick('year'), pick('month') - 1, pick('day')) / 86400000);
  return day - (pick('hour') < 12 ? 1 : 0);
}
