// What each destination is good for, plus English/Romanian words for themes, months and places.
// Used by the instant (offline) understanding of typed requests; Gemini handles anything beyond this.

export const DESTINATION_THEMES = {
  ALC: ['beach', 'sun', 'city'], ATH: ['city', 'culture', 'beach', 'sun'], BCN: ['beach', 'sun', 'city', 'nightlife', 'culture'],
  BER: ['city', 'culture', 'nightlife'], BGY: ['city', 'culture'], BLQ: ['city', 'food', 'culture'],
  BTS: ['city'], BUD: ['city', 'culture', 'nightlife', 'christmas'], BVA: ['city', 'culture', 'romance'],
  CGN: ['city', 'christmas'], CPH: ['city', 'culture'], CRL: ['city', 'food'], DTM: ['city', 'christmas'],
  FCO: ['city', 'culture', 'food', 'romance', 'sun'], FMM: ['city', 'nature', 'christmas'], GHV: ['nature', 'ski', 'culture'],
  HAM: ['city', 'christmas'], HHN: ['city', 'christmas'], LCA: ['beach', 'sun'], LGW: ['city', 'culture', 'nightlife'],
  LTN: ['city', 'culture', 'nightlife'], MLH: ['city', 'nature'], MXP: ['city', 'culture', 'nature'],
  NAP: ['beach', 'sun', 'food', 'culture'], NCE: ['beach', 'sun', 'city', 'romance'], NUE: ['city', 'christmas', 'culture'],
  OTP: ['city', 'nightlife'], PRG: ['city', 'culture', 'christmas', 'nightlife', 'romance'], RHO: ['beach', 'sun'],
  RMI: ['beach', 'sun'], SOF: ['city', 'nature', 'ski'], STR: ['city', 'christmas'], TRN: ['city', 'food', 'nature'],
  VCE: ['city', 'culture', 'romance'], VLC: ['beach', 'sun', 'city', 'food'], VRN: ['city', 'romance', 'nature'],
  WMI: ['city', 'christmas'], WRO: ['city', 'christmas'],
};

/** Theme → words that ask for it (diacritics removed, lower case). */
export const THEME_WORDS = {
  beach: ['beach', 'beaches', 'seaside', 'sea', 'coast', 'ocean', 'plaja', 'plaje', 'la mare', 'marea', 'litoral'],
  sun: ['warm', 'sunny', 'sun', 'hot', 'cald', 'calduros', 'soare', 'insorit'],
  city: ['city break', 'citybreak', 'city', 'cities', 'oras', 'orase'],
  culture: ['culture', 'museum', 'museums', 'history', 'historic', 'cultura', 'muzeu', 'muzee', 'istorie'],
  nightlife: ['party', 'nightlife', 'clubs', 'clubbing', 'petrecere', 'distractie', 'viata de noapte'],
  nature: ['mountain', 'mountains', 'hiking', 'nature', 'lake', 'lakes', 'munte', 'munti', 'natura', 'drumetie', 'lac'],
  ski: ['ski', 'skiing', 'schi', 'partie'],
  food: ['food', 'foodie', 'gastronomy', 'wine', 'mancare', 'gastronomie', 'vin'],
  christmas: ['christmas market', 'christmas markets', 'targ de craciun', 'targuri de craciun', 'targul de craciun'],
  romance: ['romantic', 'romance', 'honeymoon', 'romantica', 'luna de miere'],
};

export const THEME_LABELS = {
  en: { beach: 'Beach destinations', sun: 'Warm destinations', city: 'City breaks', culture: 'Culture trips', nightlife: 'Nightlife cities',
    nature: 'Mountains & nature', ski: 'Ski destinations', food: 'Food lovers’ cities', christmas: 'Christmas markets', romance: 'Romantic getaways' },
  ro: { beach: 'Destinații la mare', sun: 'Destinații calde', city: 'City break', culture: 'Orașe de cultură', nightlife: 'Viață de noapte',
    nature: 'Munte și natură', ski: 'Destinații de schi', food: 'Orașe pentru gurmanzi', christmas: 'Târguri de Crăciun', romance: 'Escapade romantice' },
};

export const MONTH_WORDS = [
  ['january', 'jan', 'ianuarie', 'ian'], ['february', 'feb', 'februarie'], ['march', 'mar', 'martie'], ['april', 'apr', 'aprilie'],
  ['may', 'mai'], ['june', 'jun', 'iunie'], ['july', 'jul', 'iulie'], ['august', 'aug'], ['september', 'sep', 'sept', 'septembrie'],
  ['october', 'oct', 'octombrie'], ['november', 'nov', 'noiembrie', 'noi'], ['december', 'dec', 'decembrie'],
];

/** Romanian (and a few alternative) names → the English name used in the data. */
export const PLACE_ALIASES = {
  londra: 'london', roma: 'rome', milano: 'milan', venetia: 'venice', praga: 'prague', varsovia: 'warsaw', atena: 'athens',
  napoli: 'naples', torino: 'turin', nisa: 'nice', rodos: 'rhodes', budapesta: 'budapest', bucuresti: 'bucharest',
  colonia: 'cologne', koln: 'cologne', nurnberg: 'nuremberg', munchen: 'munich', copenhaga: 'copenhagen', bruxelles: 'brussels',
  italia: 'italy', spania: 'spain', franta: 'france', germania: 'germany', grecia: 'greece', anglia: 'united kingdom',
  'marea britanie': 'united kingdom', uk: 'united kingdom', england: 'united kingdom', polonia: 'poland', ungaria: 'hungary',
  cipru: 'cyprus', cehia: 'czech republic', slovacia: 'slovakia', belgia: 'belgium', danemarca: 'denmark', elvetia: 'switzerland',
  romania: 'romania', olanda: 'netherlands', austria: 'austria', portugalia: 'portugal', turcia: 'turkey',
};

/** Words that suggest the request is Romanian. */
export const ROMANIAN_HINTS = [
  'zbor', 'zboruri', 'bilet', 'bilete', 'pentru', 'spre', 'saptamana', 'saptamani', 'luna', 'vreau', 'caut', 'ieftin', 'ieftine',
  'weekendul', 'maine', 'azi', 'astazi', 'peste', 'zile', 'nopti', 'noapte', 'persoane', 'oameni', 'ceva', 'si', 'cu', 'din', 'sub',
  'pana', 'viitoare', 'viitor', 'mare', 'munte', 'craciun', 'revelion', 'in', 'la', 'o', 'doi', 'doua', 'trei',
];
export const ENGLISH_HINTS = [
  'the', 'to', 'for', 'next', 'week', 'flight', 'flights', 'cheap', 'cheapest', 'beach', 'under', 'days', 'nights', 'people',
  'city', 'this', 'tomorrow', 'today', 'search', 'find', 'trip', 'weekend', 'in', 'a', 'with', 'and', 'somewhere',
];
