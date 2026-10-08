/* Gesetzliche Feiertage je Bundesland (landesweite, ohne rein kommunale) */
const REGIONS = { BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen' };
const holCache = {};
function holidays(y) {
  const R = (state && state.ui && REGIONS[state.ui.region]) ? state.ui.region : 'HH';
  const ck = R + y;
  if (holCache[ck]) return holCache[ck];
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  const E = new Date(y, mo - 1, da);
  const list = [
    [new Date(y, 0, 1), 'Neujahr'], [addDays(E, -2), 'Karfreitag'], [addDays(E, 1), 'Ostermontag'],
    [new Date(y, 4, 1), 'Tag der Arbeit'], [addDays(E, 39), 'Christi Himmelfahrt'], [addDays(E, 50), 'Pfingstmontag'],
    [new Date(y, 9, 3), 'Tag der Deutschen Einheit'],
    [new Date(y, 11, 25), '1. Weihnachtstag'], [new Date(y, 11, 26), '2. Weihnachtstag']
  ];
  const has = (...rs) => rs.includes(R);
  if (has('BW', 'BY', 'ST')) list.push([new Date(y, 0, 6), 'Heilige Drei Könige']);
  if ((has('BE') && y >= 2019) || (has('MV') && y >= 2023)) list.push([new Date(y, 2, 8), 'Internationaler Frauentag']);
  if (has('BW', 'BY', 'HE', 'NW', 'RP', 'SL')) list.push([addDays(E, 60), 'Fronleichnam']);
  if (has('SL')) list.push([new Date(y, 7, 15), 'Mariä Himmelfahrt']);
  if (has('TH') && y >= 2019) list.push([new Date(y, 8, 20), 'Weltkindertag']);
  if (has('BB', 'MV', 'SN', 'ST', 'TH') || (has('HB', 'HH', 'NI', 'SH') && y >= 2018)) list.push([new Date(y, 9, 31), 'Reformationstag']);
  if (has('BW', 'BY', 'NW', 'RP', 'SL')) list.push([new Date(y, 10, 1), 'Allerheiligen']);
  if (has('SN')) { let d = new Date(y, 10, 22); while (d.getDay() !== 3) d = addDays(d, -1); list.push([d, 'Buß- und Bettag']); }
  list.sort((p, q) => p[0] - q[0]);
  return (holCache[ck] = { list, map: new Map(list.map(([dt, n]) => [ymd(dt), n])) });
}
const holidayName = d => holidays(d.getFullYear()).map.get(ymd(d));
const isWorkday = d => d.getDay() >= 1 && d.getDay() <= 5 && !holidayName(d);
const isXmasHalf = d => d.getMonth() === 11 && (d.getDate() === 24 || d.getDate() === 31);
/* Wie viel Urlaub ein Tag kostet: 0 an freien Tagen, 0,5 an halben Tagen, sonst 1 */
function vacWeight(d, half) {
  if (!isWorkday(d)) return 0;
  if (half || (state.vacation.halfXmas && isXmasHalf(d))) return 0.5;
  return 1;
}
function vacDays(from, to, half) {
  let n = 0;
  const halves = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { const w = vacWeight(d, half); n += w; if (w === 0.5 && !half) halves.push(dm(d)); }
  return { n, halves };
}
const numTxt = n => numDe(n, n % 1 ? 1 : 0);
