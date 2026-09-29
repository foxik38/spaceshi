import { AU, C, DAY, LY, PC, YEAR } from './constants';
import { formatNumber } from './math';
import { getUnits } from '../i18n';

/**
 * Formatters for physical quantities. They honour the metric / imperial setting and return English-style number text
 * ("1,234.5"); the HUD passes the finished string through `L()` once to localise separators and unit tokens.
 * Astronomical units (AU, ly, pc, M☉, R☉, L☉) are the same in both systems.
 */
const FT = 0.3048, IN = 0.0254, MI = 1609.344, LB = 0.45359237;
const imperial = () => getUnits() === 'imperial';
const grouped = (v: number, frac = 0) => v.toLocaleString('en-US', { maximumFractionDigits: frac });

/** Human-friendly distance with automatically chosen unit. */
export function formatDistance(m: number): string {
  const a = Math.abs(m);
  if (!Number.isFinite(m)) return '—';
  if (imperial() && a < 0.05 * AU) {
    if (a < FT) return `${(m / IN).toFixed(0)} in`;
    if (a < 0.5 * MI) return `${(m / FT).toFixed(a < 30 ? 1 : 0)} ft`;
    if (a < 1e8) return `${grouped(m / MI, a < 1e5 ? 1 : 0)} mi`;
    return `${formatNumber(m / MI, 4)} mi`;
  }
  if (a < 1) return `${(m * 100).toFixed(0)} cm`;
  if (a < 1e4) return `${m.toFixed(a < 100 ? 1 : 0)} m`;
  if (a < 1e8) return `${grouped(m / 1e3, a < 1e5 ? 1 : 0)} km`;
  if (a < 0.05 * AU) return `${formatNumber(m / 1e3, 4)} km`;
  if (a < 0.1 * LY) return `${(m / AU).toFixed(a < 10 * AU ? 3 : a < 1000 * AU ? 2 : 0)} AU`;
  if (a < 1e3 * LY) return `${(m / LY).toFixed(a < 10 * LY ? 3 : 2)} ly`;
  if (a < 1e6 * LY) return `${(m / LY / 1e3).toFixed(2)} kly`;
  if (a < 1e9 * LY) return `${(m / LY / 1e6).toFixed(2)} Mly`;
  return `${(m / LY / 1e9).toFixed(3)} Gly`;
}

export function formatSpeed(mps: number): string {
  const a = Math.abs(mps);
  if (imperial() && a < 0.01 * C) {
    if (a < 300) return `${(mps / 0.44704).toFixed(1)} mph`;
    const mis = mps / MI;
    return `${mis.toFixed(Math.abs(mis) < 100 ? 2 : Math.abs(mis) < 1e3 ? 1 : 0)} mi/s`;
  }
  if (a < 1e3) return `${mps.toFixed(1)} m/s`;
  if (a < 1e6) return `${(mps / 1e3).toFixed(a < 1e5 ? 2 : 1)} km/s`;
  if (a < 0.01 * C) return `${(mps / 1e3).toFixed(0)} km/s`;
  if (a < 1000 * C) return `${(mps / C).toFixed(3)} c`;
  const ly = mps / LY * YEAR;
  if (ly < 1e6) return `${formatNumber(ly, 3)} ly/yr`;
  return `${formatNumber(mps / LY * YEAR / 1e6, 3)} Mly/yr`;
}

export function formatDuration(s: number): string {
  const a = Math.abs(s);
  if (!Number.isFinite(s)) return '—';
  if (a < 60) return `${s.toFixed(1)} s`;
  if (a < 3600) return `${(s / 60).toFixed(1)} min`;
  if (a < DAY) return `${(s / 3600).toFixed(2)} h`;
  if (a < YEAR) return `${(s / DAY).toFixed(2)} d`;
  if (a < 1e3 * YEAR) return `${(s / YEAR).toFixed(2)} yr`;
  if (a < 1e6 * YEAR) return `${(s / YEAR / 1e3).toFixed(2)} kyr`;
  if (a < 1e9 * YEAR) return `${(s / YEAR / 1e6).toFixed(2)} Myr`;
  return `${(s / YEAR / 1e9).toFixed(2)} Gyr`;
}

/** A mass in kilograms, or pounds when the unit system is imperial. */
export function formatKg(kg: number, digits = 3): string {
  return imperial() ? `${formatNumber(kg / LB, digits)} lb` : `${formatNumber(kg, digits)} kg`;
}

export function formatMass(kg: number): string {
  if (!(kg > 0)) return '—';
  const table: [number, string][] = [
    [1.98847e30, 'M☉'], [1.89813e27, 'M♃'], [5.9722e24, 'M⊕'], [7.342e22, 'M☾'],
  ];
  for (const [v, u] of table) {
    if (kg >= v * 0.1) return `${formatNumber(kg / v, 3)} ${u}  (${formatKg(kg)})`;
  }
  return formatKg(kg);
}

export function formatRadius(m: number): string {
  if (!(m > 0)) return '—';
  const abs = imperial()
    ? (v: number) => (v >= 1e3 * MI * 0.5 ? `${formatNumber(v / MI, 4)} mi` : v >= 0.5 * MI ? `${(v / MI).toFixed(v < 10 * MI ? 2 : 1)} mi` : `${(v / FT).toFixed(1)} ft`)
    : (v: number) => (v >= 1e6 ? `${formatNumber(v / 1e3, 5)} km` : v >= 1e3 ? `${(v / 1e3).toFixed(v < 1e4 ? 2 : 1)} km` : `${v.toFixed(1)} m`);
  if (m >= 6.957e8 * 0.3) return `${formatNumber(m / 6.957e8, 3)} R☉  (${imperial() ? formatNumber(m / MI, 4) + ' mi' : formatNumber(m / 1e3, 4) + ' km'})`;
  return abs(m);
}

export function formatTemperature(K: number): string {
  if (!Number.isFinite(K)) return '—';
  if (K > 5000) return `${Math.round(K).toLocaleString('en-US')} K`;
  const alt = imperial() ? `${((K - 273.15) * 1.8 + 32).toFixed(0)} °F` : `${(K - 273.15).toFixed(0)} °C`;
  return `${K.toFixed(K < 100 ? 1 : 0)} K  (${alt})`;
}

/** Mean density (kg/m³ or lb/ft³). */
export function formatDensity(kgm3: number): string {
  return imperial() ? `${formatNumber(kgm3 * 0.062427961, 3)} lb/ft³` : `${formatNumber(kgm3, 3)} kg/m³`;
}

/** Gravitational acceleration with its Earth-g equivalent. */
export function formatGravity(ms2: number): string {
  const g = `${formatNumber(ms2 / 9.80665, 3)} g`;
  return imperial() ? `${formatNumber(ms2 / FT, 3)} ft/s²  (${g})` : `${formatNumber(ms2, 3)} m/s²  (${g})`;
}

/** Surface pressure: Pa/kPa (or psi) plus atmospheres. */
export function formatPressure(pa: number): string {
  const atm = formatNumber(pa / 101325, 3);
  if (imperial()) return `${formatNumber(pa * 0.00014503774, 3)} psi  (${atm} atm)`;
  return pa >= 1000 ? `${formatNumber(pa / 1000, 3)} kPa  (${atm} atm)` : `${formatNumber(pa, 3)} Pa`;
}

export function formatPeriod(s: number): string { return formatDuration(s); }

export { PC };
