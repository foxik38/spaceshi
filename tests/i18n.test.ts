import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AU, LY } from '../src/core/constants';
import { Universe } from '../src/sim/universe';
import { buildSolarSystem } from '../src/data/solarSystem';
import { L, bodyDescription, bodyFacts, bodyName, constellation, fold, plural, setLang, setUnits, t, untranslated } from '../src/i18n';
import { CS_TEXT } from '../src/i18n/cs/texts';
import { CS_UI } from '../src/i18n/cs/ui';
import { CS_CONSTELLATIONS, CS_DSO_NAMES } from '../src/i18n/cs/names';
import { localizeUnits } from '../src/i18n/textUnits';
import { formatDistance, formatGravity, formatMass, formatSpeed, formatTemperature } from '../src/core/units';

const universe = new Universe();
buildSolarSystem(universe);

afterEach(() => { setLang('en'); setUnits('metric'); });

describe('Czech coverage of the built-in objects', () => {
  beforeAll(() => setLang('cs'));

  it('translates every hand-written description and fact list', () => {
    setLang('cs');
    const missing: string[] = [];
    for (const b of universe.bodies) {
      if (b.description && !CS_TEXT[b.id]?.d) missing.push(`${b.id}: description`);
      if (b.facts.length && CS_TEXT[b.id]?.f?.length !== b.facts.length) missing.push(`${b.id}: facts (${b.facts.length})`);
    }
    expect(missing).toEqual([]);
  });

  it('has no stray Czech entries for unknown bodies', () => {
    const ids = new Set(universe.bodies.map((b) => b.id));
    expect(Object.keys(CS_TEXT).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('translates type labels, atmospheres and discovery notes', () => {
    setLang('cs');
    const bad: string[] = [];
    const isEnglish = (s: string) => t(s) === s && /[A-Za-z]{4}/.test(s) && !/^(\d{4})(,|$)/.test(s);
    for (const b of universe.bodies) {
      if (isEnglish(b.typeLabel)) bad.push(`type: ${b.typeLabel}`);
      if (b.atmosphere && isEnglish(b.atmosphere.composition)) bad.push(`atmosphere: ${b.atmosphere.composition}`);
      if (b.discovered && isEnglish(b.discovered)) bad.push(`discovered: ${b.discovered}`);
      if (b.group && isEnglish(b.group) && b.group !== 'Solar System') bad.push(`group: ${b.group}`);
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it('gives the planets and moons their Czech names', () => {
    setLang('cs');
    const name = (id: string) => bodyName(universe.get(id)!);
    expect([name('earth'), name('moon'), name('sun'), name('uranus'), name('ganymede'), name('vesta')]).toEqual(['Země', 'Měsíc', 'Slunce', 'Uran', 'Ganymed', '(4) Vesta']);
    setLang('en');
    expect(name('earth')).toBe('Earth');
  });

  it('covers all 88 constellations, in both cases', () => {
    setLang('cs');
    expect(Object.keys(CS_CONSTELLATIONS)).toHaveLength(88);
    expect(constellation('CMa')).toBe('Velký pes');
    expect(constellation('CMa', true)).toBe('Velkého psa');
    const stars = JSON.parse(readFileSync('public/data/stars-meta.json', 'utf8'));
    const cons = new Set<string>(stars.rows.map((r: unknown[]) => r[stars.fields.indexOf('con')] as string));
    expect([...cons].filter((c) => !CS_CONSTELLATIONS[c])).toEqual([]);
  });

  it('translates the common names of deep-sky objects that have one', () => {
    const dso = JSON.parse(readFileSync('public/data/dso.json', 'utf8'));
    const names = new Set<string>(dso.rows.map((r: unknown[]) => r[dso.fields.indexOf('common')] as string).filter(Boolean));
    const unchanged = [...names].filter((n) => !CS_DSO_NAMES[n]);
    // a handful are catalogue-style designations that Czech keeps as they are
    expect(unchanged.sort()).toEqual(['Browning', 'Centaurus A', 'Fornax A', 'Fornax B', 'Fourcade-Figueroa', 'Gem A', 'Omega Centauri', 'Perseus A', 'Polarissima Australis', 'Polarissima Borealis', 'Sextans A', 'Sextans B', "Amas de l'Ecu de Sobieski", 'S Nor Cluster'].sort());
  });

  it('translates generated star descriptions with the right grammar', () => {
    setLang('cs');
    expect(t('G-type yellow main-sequence star (G2V)')).toBe('Žlutá hvězda hlavní posloupnosti typu G (G2V)');
    expect(t('K-type orange giant (K2III)')).toBe('Oranžový obr typu K (K2III)');
    expect(t('Red dwarf (M5.5V)')).toBe('Červený trpaslík (M5.5V)');
    expect(t('B-type blue-white supergiant (B8Ia)')).toBe('Modrobílý veleobr typu B (B8Ia)');
    expect(t('A real star 4.2 light-years from the Sun in the constellation Cen. Positions from the HYG database (Hipparcos, Yale Bright Star and Gliese catalogues).'))
      .toBe('Skutečná hvězda ve vzdálenosti 4,2 světelného roku od Slunce v souhvězdí Kentaura. Polohy pocházejí z databáze HYG (katalogy Hipparcos, Yale Bright Star a Gliese).');
    expect(t('Host star of 3 confirmed exoplanets, 12 light-years away (Open Exoplanet Catalogue).')).toContain('byly potvrzeny 3 exoplanety');
    expect(t('Exoplanet host · 1 planet')).toBe('Hvězda s exoplanetami · 1 planeta');
    expect(t('Exoplanet host · 5 planets')).toBe('Hvězda s exoplanetami · 5 planet');
    expect(t('Launched 24 April 1990')).toBe('Vypuštěno 24. dubna 1990');
    expect(t('2016 (RV)')).toBe('2016 (radiální rychlost)');
  });

  it('never leaves a body without a translated description in Czech mode', () => {
    setLang('cs');
    for (const b of universe.bodies) {
      const d = bodyDescription(b);
      if (b.description) expect(d).toBe(CS_TEXT[b.id].d);
      expect(bodyFacts(b)).toHaveLength(b.facts.length);
    }
  });
});

describe('numbers and units', () => {
  it('localises decimals, thousands and astronomical unit tokens for Czech', () => {
    setLang('cs');
    expect(L('1,234.5 km')).toBe('1 234,5 km');
    expect(L('4.25 ly')).toBe('4,25 sv. r.');
    expect(L('2.50 Myr')).toBe('2,50 mil. let');
    expect(L('0.123 ly/yr')).toBe('0,123 sv. r./r.');
    expect(L('e = 0.0167')).toBe('e = 0,0167');
    setLang('en');
    expect(L('1,234.5 km')).toBe('1,234.5 km');
  });

  it('formats imperial lengths, speeds and temperatures', () => {
    setUnits('imperial');
    expect(formatDistance(0.1)).toBe('4 in');
    expect(formatDistance(100)).toBe('328 ft');
    expect(formatDistance(1609.344 * 25)).toBe('25 mi');
    expect(formatDistance(1609.344 * 2.5)).toBe('2.5 mi');
    expect(formatDistance(1 * AU)).toBe('1.000 AU');
    expect(formatDistance(4.2 * LY)).toBe('4.200 ly');
    expect(formatSpeed(10)).toBe('22.4 mph');
    expect(formatSpeed(7660)).toBe('4.76 mi/s');
    expect(formatTemperature(288)).toBe('288 K  (59 °F)');
    expect(formatGravity(9.80665)).toContain('ft/s²');
    expect(formatMass(5.9722e24)).toContain('lb');
    setUnits('metric');
    expect(formatDistance(100)).toBe('100 m');
    expect(formatDistance(42)).toBe('42.0 m');
    expect(formatTemperature(288)).toBe('288 K  (15 °C)');
  });

  it('rewrites metric quantities in running text for imperial units, keeping precision', () => {
    setUnits('imperial');
    setLang('en');
    expect(localizeUnits('A 20-km-high ridge; winds reach 1,800 km/h; a 10 m gold mirror; 3.8 cm per year.'))
      .toBe('A 12-mile-high ridge; winds reach 1,100 mph; a 33 ft gold mirror; 1.5 in per year.');
    expect(localizeUnits('It flies at 192 km/s, 6.1 million km above the Sun; 15 million K core; 100 K at night.')).toContain('119 mi/s, 3.8 million mi');
    expect(localizeUnits('100 K at night')).toBe('−280 °F at night');
    expect(localizeUnits('24 h 37 min and 5 months')).toBe('24 h 37 min and 5 months');
    setLang('cs');
    expect(localizeUnits('Větry dosahují 1\u00a0800 km/h a 32\u00a0000 km od Země, prstenec silný 10 m.')).toBe('Větry dosahují 1\u00a0100\u00a0mph a 20\u00a0000\u00a0mi od Země, prstenec silný 33\u00a0ft.');
    setUnits('metric');
    expect(localizeUnits('22 km')).toBe('22 km');
    setUnits('imperial');
    setLang('cs');
    expect(localizeUnits('Olympus Mons, 22\u00a0km; 15 milionů K')).toBe('Olympus Mons, 14\u00a0mi; 15 milionů K');
  });
});

describe('search helpers and plurals', () => {
  it('folds diacritics so plain typing finds Czech names', () => {
    expect(fold('Země')).toBe('zeme');
    expect(fold('Sírius')).toBe('sirius');
    expect(fold('Čurjumov')).toBe('curjumov');
  });

  it('picks the right Czech plural form', () => {
    setLang('cs');
    const w = (n: number) => plural(n, ['planet', 'planets'], ['planeta', 'planety', 'planet']);
    expect([w(1), w(2), w(4), w(5), w(0), w(11)]).toEqual(['planeta', 'planety', 'planety', 'planet', 'planet', 'planet']);
    setLang('en');
    expect(plural(2, ['planet', 'planets'], ['planeta', 'planety', 'planet'])).toBe('planets');
  });

  it('leaves no UI string untranslated in a Czech render of the static tables', () => {
    setLang('cs');
    const src = ['src/ui/ui.ts', 'src/ui/sandboxPanel.ts', 'src/ui/loading.ts', 'src/app.ts', 'src/app/sandbox.ts', 'src/app/selectable.ts']
      .map((f) => readFileSync(f, 'utf8')).join('\n');
    const keys = new Set<string>();
    for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
    const bad = [...keys].filter((k) => !(k in CS_UI) && t(k) === k);
    expect(bad).toEqual([]);
    expect(untranslated().filter((s) => keys.has(s))).toEqual([]);
  });
});
