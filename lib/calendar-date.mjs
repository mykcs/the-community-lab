// Date-only presentation never passes through a timezone or Date.parse.
// Precision and unknown / evidence strings remain intact.
export function calendarDate(value) {
  const original = String(value ?? '');
  const match = /^(\d{4})(?:[-./年](\d{1,2})(?:[-./月](\d{1,2})日?)?月?)?$/.exec(original.trim());
  if (!match) return original;
  const [, year, month, day] = match;
  if (!month) return year;
  const m = Number(month), d = Number(day);
  if (m < 1 || m > 12) return original;
  const leap = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const max = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  if (day && (d < 1 || d > max)) return original;
  return `${year}-${month.padStart(2, '0')}${day ? '-' + day.padStart(2, '0') : ''}`;
}

export function nonCanonicalDates(text) {
  const numeric = [...text.matchAll(/\b\d{4}(?:[/.]\d{1,2}[/.]\d{1,2}|-\d{1,2}-\d{1,2})\b/g)]
    .map(match => match[0]).filter(value => calendarDate(value) !== value);
  const named = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/g) ?? [];
  return [...numeric, ...named];
}
