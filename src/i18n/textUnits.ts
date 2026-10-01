import { getLang, getUnits } from './index';

/**
 * Descriptions and facts are written with metric quantities ("22 km", "1,800 km/h", "3.8 cm"). When the player picks
 * imperial units this rewrites those quantities in the finished text, keeping the number of significant digits so that
 * "32,000 km" becomes "20,000 mi" rather than a falsely precise "19,884 mi".
 */

const SP = String.raw`[\u00a0 ]`;
const EN_NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const CS_NUM = String.raw`\d{1,3}(?:[  ]\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;

function parse(s: string, cs: boolean): number {
  return Number(cs ? s.replace(/[  ]/g, '').replace(',', '.') : s.replace(/,/g, ''));
}

function sigDigits(s: string): number {
  const digits = s.replace(/[^\d]/g, '').replace(/^0+/, '').replace(/0+$/, '');
  return Math.max(2, digits.length);
}

function fmt(v: number, sig: number, cs: boolean): string {
  if (v === 0) return '0';
  const mag = Math.floor(Math.log10(Math.abs(v)));
  const rounded = Number(v.toPrecision(Math.min(sig, 6)));
  const frac = Math.max(0, sig - 1 - mag);
  const text = rounded.toLocaleString(cs ? 'cs-CZ' : 'en-US', { maximumFractionDigits: Math.min(frac, 3), useGrouping: true });
  return cs ? text.replace(/ /g, ' ') : text;
}

type Rule = { re: RegExp; conv: (m: RegExpExecArray, cs: boolean) => string };

function build(cs: boolean): Rule[] {
  const N = cs ? CS_NUM : EN_NUM;
  const sp = cs ? '\u00a0' : ' ';
  const q = (n: string, factor: number) => fmt(parse(n, cs) * factor, sigDigits(n), cs);
  const million = cs ? 'mil\\.' : 'million';
  const tonnes = cs ? 'milionů tun' : 'million tonnes';
  return [
    { re: new RegExp(`(${N})${SP}${million}${SP}km\\b`, 'g'), conv: (m) => `${q(m[1], 0.621371)} ${cs ? 'mil.' : 'million'}${sp}mi` },
    { re: new RegExp(`(${N})${SP}${tonnes}`, 'g'), conv: (m) => `${q(m[1], 1.10231)} ${cs ? 'milionů amerických tun' : 'million short tons'}` },
    { re: new RegExp(`(${N})${SP}km/h\\b`, 'g'), conv: (m) => `${q(m[1], 0.621371)}${sp}mph` },
    { re: new RegExp(`(${N})${SP}km/s\\b`, 'g'), conv: (m) => `${q(m[1], 0.621371)}${sp}mi/s` },
    { re: new RegExp(`(\\d+)-km-(\\p{L}+)`, 'gu'), conv: (m) => `${fmt(Number(m[1]) * 0.621371, sigDigits(m[1]), cs)}-${cs ? 'mílový' : 'mile'}-${m[2]}` },
    { re: new RegExp(`(${N})${SP}km\\b`, 'g'), conv: (m) => `${q(m[1], 0.621371)}${sp}mi` },
    { re: new RegExp(`(${N})${SP}cm\\b`, 'g'), conv: (m) => `${q(m[1], 0.393701)}${sp}in` },
    { re: new RegExp(`(${N})${SP}m(?![\\p{L}/²³])`, 'gu'), conv: (m) => `${q(m[1], 3.28084)}${sp}ft` },
    { re: new RegExp(`(${N})${SP}K\\b(?!${SP}\\()`, 'g'), conv: (m) => {
      const k = parse(m[1], cs);
      const f = (k - 273.15) * 1.8 + 32;
      return `${fmt(Math.abs(f), sigDigits(m[1]), cs)}${cs ? ' ' : ' '}°F`.replace(/^/, f < 0 ? '−' : '');
    } },
  ];
}

const RULES = { en: build(false), cs: build(true) };

/** Rewrite metric quantities in running text when the unit system is imperial. */
export function localizeUnits(text: string): string {
  if (getUnits() !== 'imperial' || !text) return text;
  const lang = getLang();
  let out = text;
  for (const rule of RULES[lang]) {
    // replace callbacks receive (match, ...groups, offset, string): the leading entries index like a RegExp match
    out = out.replace(rule.re, (...args) => rule.conv(args as unknown as RegExpExecArray, lang === 'cs'));
  }
  return out;
}
