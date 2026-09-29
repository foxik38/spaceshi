/**
 * Localisation and unit-system state.
 *
 * The simulation data stays in English. Everything shown to the player goes through `t()` (UI text and data-derived
 * labels), `objectName()` / `starName()` / `dsoName()` (proper names), `L()` (numbers and unit tokens in a formatted
 * value) or `localizeUnits()` (metric quantities inside running text). Switching language or unit system fires
 * `onI18nChange`, and the HUD rebuilds itself.
 */
import { CS_UI, CS_STAT } from './cs/ui';
import { CS_PATTERNS } from './cs/patterns';
import { CS_BODY_ALIASES, CS_BODY_NAMES, CS_CONSTELLATIONS, CS_CONSTELLATION_LABELS, CS_DSO_NAMES, CS_STAR_NAMES } from './cs/names';
import { CS_TEXT } from './cs/texts';

export type Lang = 'en' | 'cs';
export type UnitSystem = 'metric' | 'imperial';

export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'cs', label: 'Čeština' },
];

const KEY_LANG = 'spaceshi.lang';
const KEY_UNITS = 'spaceshi.units';

function readStore(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStore(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* storage can be blocked */ }
}

function detectLang(): Lang {
  const saved = readStore(KEY_LANG);
  if (saved === 'en' || saved === 'cs') return saved;
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.[0] ?? navigator.language ?? 'en') : 'en';
  return /^(cs|sk)\b/i.test(nav) ? 'cs' : 'en';
}

function detectUnits(): UnitSystem {
  const saved = readStore(KEY_UNITS);
  if (saved === 'metric' || saved === 'imperial') return saved;
  // only the US, Liberia and Myanmar use imperial units day to day
  const nav = typeof navigator !== 'undefined' ? (navigator.language ?? 'en') : 'en';
  return /-(US|LR|MM)$/i.test(nav) ? 'imperial' : 'metric';
}

let lang: Lang = detectLang();
let units: UnitSystem = detectUnits();
const listeners = new Set<() => void>();

export const getLang = () => lang;
export const getUnits = () => units;
export const isCs = () => lang === 'cs';

export function setLang(l: Lang) {
  if (l === lang) return;
  lang = l;
  writeStore(KEY_LANG, l);
  applyDocumentLang();
  listeners.forEach((fn) => fn());
}

export function setUnits(u: UnitSystem) {
  if (u === units) return;
  units = u;
  writeStore(KEY_UNITS, u);
  listeners.forEach((fn) => fn());
}

/** Subscribe to language / unit changes. Returns an unsubscribe function. */
export function onI18nChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyDocumentLang() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.title = t('Spaceshi — Universe Sandbox');
}

// ---------------------------------------------------------------- translation
const patternCache = new Map<string, string>();
/** Strings that reached `t()` in Czech mode without a translation (used by the coverage test and the dev console). */
const missing = new Set<string>();
export const untranslated = () => [...missing];

/**
 * Translate a string. Looks for an exact entry first, then tries the pattern rules that handle generated text
 * (star types, procedural descriptions, "N planets"…). Unknown strings come back unchanged. `{name}` placeholders in
 * the (translated) result are filled from `vars`.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  let out = text;
  if (lang === 'cs') {
    const hit = CS_UI[text];
    if (hit !== undefined) out = hit;
    else {
      const cached = patternCache.get(text);
      if (cached !== undefined) out = cached;
      else {
        let found: string | undefined;
        for (const [re, fn] of CS_PATTERNS) {
          const m = re.exec(text);
          if (m) { found = fn(m); break; }
        }
        if (patternCache.size > 4000) patternCache.clear();
        patternCache.set(text, found ?? text);
        if (found !== undefined) out = found;
        else if (/[A-Za-z]{3}/.test(text)) missing.add(text);
      }
    }
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  return out;
}

/** Translate an info-panel row label or section heading (own table: "Orbit" is a button elsewhere). */
export function ts(label: string): string {
  return lang === 'cs' ? CS_STAT[label] ?? t(label) : label;
}

/** Czech plural forms: 1 / 2–4 / 0 and 5+. English uses the first two. */
export function plural(n: number, en: [string, string], cs: [string, string, string]): string {
  if (lang === 'cs') return n === 1 ? cs[0] : n >= 2 && n <= 4 ? cs[1] : cs[2];
  return n === 1 ? en[0] : en[1];
}

// ---------------------------------------------------------------- object names and texts
interface Named { id: string; name: string; userCreated?: boolean }

/** Display name of a body: Czech name if there is one, catalogue/proper names otherwise; user-made names stay as typed. */
export function bodyName(b: Named): string {
  if (lang !== 'cs' || b.userCreated) return b.name;
  const hit = CS_BODY_NAMES[b.id];
  if (hit) return hit;
  return starName(b.name);
}

/** Every string a body should be found by when searching (both languages, folded by the caller). */
export function bodySearchNames(b: Named & { aliases: string[] }): string[] {
  const out = [b.name, ...b.aliases, b.id];
  const cs = CS_BODY_NAMES[b.id];
  if (cs) out.push(cs);
  const extra = CS_BODY_ALIASES[b.id];
  if (extra) out.push(...extra);
  return out;
}

/** Czech form of a catalogue star's proper name (also handles "Proxima Centauri b"-style planet names). */
export function starName(name: string): string {
  if (lang !== 'cs') return name;
  const hit = CS_STAR_NAMES[name];
  if (hit) return hit;
  for (const key in CS_STAR_NAMES) {
    if (name.startsWith(key + ' ')) return CS_STAR_NAMES[key] + name.slice(key.length);
  }
  return name;
}

export function dsoName(name: string): string {
  return lang === 'cs' ? CS_DSO_NAMES[name] ?? name : name;
}

/** Search aliases for a star or deep-sky object that has a Czech name. */
export function czechNameOf(kind: 'star' | 'dso', name: string): string | undefined {
  return kind === 'star' ? CS_STAR_NAMES[name] : CS_DSO_NAMES[name];
}

/** IAU abbreviation → constellation name (Czech, or the abbreviation itself in English). `genitive` for "in the constellation of …". */
export function constellation(abbr: string, genitive = false): string {
  if (lang !== 'cs') return abbr;
  const c = CS_CONSTELLATIONS[abbr];
  return c ? c[genitive ? 1 : 0] : abbr;
}

export function constellationLabel(name: string): string {
  return lang === 'cs' ? CS_CONSTELLATION_LABELS[name] ?? name : name;
}

export function bodyDescription(b: { id: string; description: string }): string | undefined {
  if (!b.description) return undefined;
  if (lang === 'cs') return CS_TEXT[b.id]?.d ?? t(b.description);
  return b.description;
}

export function bodyFacts(b: { id: string; facts: string[] }): string[] {
  if (lang === 'cs') {
    const f = CS_TEXT[b.id]?.f;
    if (f) return f;
    return b.facts.map((x) => t(x));
  }
  return b.facts;
}

// ---------------------------------------------------------------- numbers and unit tokens
const NBSP = ' ';

/**
 * Localise a value string produced by the (English-formatted) unit formatters: decimal comma and grouped thousands in
 * Czech, and the astronomical unit tokens (ly, yr…) spelled the local way. Call it once, at the edge, on the final text.
 */
export function L(s: string): string {
  if (lang !== 'cs') return s;
  let out = s.replace(/(\d{1,3}(?:,\d{3})+)(\.\d+)?/g, (_, whole: string, frac?: string) => whole.replace(/,/g, NBSP) + (frac ? ',' + frac.slice(1) : ''));
  out = out.replace(/(\d)\.(\d)/g, '$1,$2');
  out = out.replace(/(\d) ?(Gly|Mly|kly|ly)\/yr\b/g, (_m, d, u) => `${d}${NBSP}${CS_UNIT[u]}/r.`);
  out = out.replace(/(\d) (Gly|Mly|kly|ly|Gyr|Myr|kyr|yr)\b/g, (_m, d, u) => `${d}${NBSP}${CS_UNIT[u]}`);
  out = out.replace(/\b(Gly|Mly|kly|ly|Gyr|Myr|kyr|yr)\b/g, (_m, u) => CS_UNIT[u]);
  out = out.replace(/(\d) (km|m|cm|kg|K|AU|pc|kPa|Pa|atm|mi|ft|in|lb|mph|psi|h|min|s|d|c|g|J)\b/g, `$1${NBSP}$2`);
  out = out.replace(/(\d) ([°%])/g, `$1${NBSP}$2`);
  return out;
}

const CS_UNIT: Record<string, string> = {
  ly: 'sv.\u00a0r.', kly: 'tis.\u00a0sv.\u00a0r.', Mly: 'mil.\u00a0sv.\u00a0r.', Gly: 'mld.\u00a0sv.\u00a0r.',
  yr: 'r.', kyr: 'tis.\u00a0let', Myr: 'mil.\u00a0let', Gyr: 'mld.\u00a0let',
};

/** Plain numeric formatting in the active locale (for the few places that do not go through `L`). */
export function num(n: number, maxFrac = 2): string {
  return n.toLocaleString(lang === 'cs' ? 'cs-CZ' : 'en-US', { maximumFractionDigits: maxFrac });
}

// ---------------------------------------------------------------- diacritics-insensitive search
/** Lower-case and strip diacritics, so that "zeme" finds "Země" and "sirius" finds "Sírius". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export { CS_UI };
