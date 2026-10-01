import { CS_CONSTELLATIONS } from './names';

/**
 * Rules for text that the simulation generates on the fly (star spectral descriptions, procedural system blurbs,
 * launch dates, exoplanet discovery notes). Each rule maps an English string to Czech; the first match wins.
 */

const MONTHS_GEN: Record<string, string> = {
  January: 'ledna', February: 'února', March: 'března', April: 'dubna', May: 'května', June: 'června',
  July: 'července', August: 'srpna', September: 'září', October: 'října', November: 'listopadu', December: 'prosince',
};

const METHODS: Record<string, string> = {
  RV: 'radiální rychlost', transit: 'tranzit', microlensing: 'gravitační mikročočkování', imaging: 'přímé zobrazení',
  timing: 'měření časování', astrometry: 'astrometrie', 'disk kinematics': 'kinematika disku',
};

const COLOR_M: Record<string, string> = { blue: 'modrý', 'blue-white': 'modrobílý', white: 'bílý', 'yellow-white': 'žlutobílý', yellow: 'žlutý', orange: 'oranžový', red: 'červený' };
const COLOR_F: Record<string, string> = { blue: 'modrá', 'blue-white': 'modrobílá', white: 'bílá', 'yellow-white': 'žlutobílá', yellow: 'žlutá', orange: 'oranžová', red: 'červená' };
const NOUN: Record<string, [string, boolean]> = {
  supergiant: ['veleobr', true], 'bright giant': ['jasný obr', true], giant: ['obr', true], subgiant: ['podobr', true],
  'main-sequence star': ['hvězda hlavní posloupnosti', false], subdwarf: ['podtrpaslík', true], 'white dwarf': ['bílý trpaslík', true], star: ['hvězda', false],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const NBSP = ' ';

/** "4,2 světelného roku", "1 světelný rok", "3 světelné roky", "12 světelných let". */
function lightYears(num: string): string {
  const n = Number(num);
  const shown = num.replace('.', ',');
  if (!Number.isInteger(n) || num.includes('.')) return `${shown}${NBSP}světelného roku`;
  return `${shown}${NBSP}${n === 1 ? 'světelný rok' : n >= 2 && n <= 4 ? 'světelné roky' : 'světelných let'}`;
}

function genitiveConstellation(abbr: string): string {
  const c = CS_CONSTELLATIONS[abbr];
  return c ? c[1] : abbr;
}

export const CS_PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  // "G-type yellow main-sequence star (G2V)"
  [/^([A-Z])-type\s+(blue-white|blue|white|yellow-white|yellow|orange|red)?\s*(supergiant|bright giant|giant|subgiant|main-sequence star|subdwarf|white dwarf|star)(?: \((.+)\))?$/, (m) => {
    const [noun, masc] = NOUN[m[3]];
    const color = m[2] ? (masc ? COLOR_M : COLOR_F)[m[2]] : '';
    const head = cap(color ? `${color} ${noun}` : noun);
    return `${head} typu ${m[1]}${m[4] ? ` (${m[4]})` : ''}`;
  }],
  [/^([A-Z])-type brown dwarf(?: \((.+)\))?$/, (m) => `Hnědý trpaslík typu ${m[1]}${m[2] ? ` (${m[2]})` : ''}`],
  [/^Red dwarf \((.+)\)$/, (m) => `Červený trpaslík (${m[1]})`],
  [/^White dwarf \((.+)\)$/, (m) => `Bílý trpaslík (${m[1]})`],

  // catalogue star blurbs
  [/^A real star ([\d.]+) light-years from the Sun in the constellation (\w+)\. Positions from the HYG database \(Hipparcos, Yale Bright Star and Gliese catalogues\)\.$/, (m) =>
    `Skutečná hvězda ve vzdálenosti ${lightYears(m[1])} od Slunce v souhvězdí ${genitiveConstellation(m[2])}. Polohy pocházejí z databáze HYG (katalogy Hipparcos, Yale Bright Star a Gliese).`],
  [/^A real star ([\d.]+) light-years from the Sun in the constellation (\w+)\.$/, (m) =>
    `Skutečná hvězda ve vzdálenosti ${lightYears(m[1])} od Slunce v souhvězdí ${genitiveConstellation(m[2])}.`],
  [/^A real star ([\d.]+) light-years from the Sun in (\w+)\.$/, (m) =>
    `Skutečná hvězda ve vzdálenosti ${lightYears(m[1])} od Slunce v souhvězdí ${genitiveConstellation(m[2])}.`],
  [/^A real star ([\d.]+) light-years from the Sun\.$/, (m) => `Skutečná hvězda ve vzdálenosti ${lightYears(m[1])} od Slunce.`],
  [/^A real star ([\d.]+) light-years from the Sun in the constellation (\w+)\. Positions/, (m) =>
    `Skutečná hvězda ve vzdálenosti ${lightYears(m[1])} od Slunce v souhvězdí ${genitiveConstellation(m[2])}.`],

  // exoplanet hosts
  [/^Host star of (\d+) confirmed exoplanets?, (\d+) light-years away \(Open Exoplanet Catalogue\)\.$/, (m) => {
    const n = Number(m[1]);
    const clause = n === 1 ? 'byla potvrzena 1 exoplaneta' : n <= 4 ? `byly potvrzeny ${n} exoplanety` : `bylo potvrzeno ${n} exoplanet`;
    return `Hvězda, u níž ${clause}, ve vzdálenosti ${lightYears(m[2])} (Open Exoplanet Catalogue).`;
  }],
  [/^Confirmed exoplanet system \(Open Exoplanet Catalogue\)\. Fly close to see its real planets: (.*)\.$/, (m) =>
    `Potvrzená soustava exoplanet (Open Exoplanet Catalogue). Přibližte se a uvidíte její skutečné planety: ${m[1]}.`],
  [/^Exoplanet host · (\d+) planets?$/, (m) => {
    const n = Number(m[1]);
    return `Hvězda s exoplanetami · ${n} ${n === 1 ? 'planeta' : n >= 2 && n <= 4 ? 'planety' : 'planet'}`;
  }],
  [/^Exoplanet host · (\d+)$/, (m) => `Hvězda s exoplanetami · ${m[1]}`],
  [/^Star · (.+)$/, (m) => `Hvězda · ${m[1]}`],

  // launch dates and exoplanet discovery notes
  [/^Launched (\d{1,2}) (\w+) (\d{4})$/, (m) => `Vypuštěno ${m[1]}. ${MONTHS_GEN[m[2]] ?? m[2]} ${m[3]}`],
  [/^(\d{4}) \((.+)\)$/, (m) => `${m[1]} (${METHODS[m[2]] ?? m[2]})`],
];
