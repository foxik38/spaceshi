import { AU, C, DAY, LY, PC, YEAR } from './constants';
import { formatNumber } from './math';

/** Human-friendly distance with automatically chosen unit. */
export function formatDistance(m: number): string {
  const a = Math.abs(m);
  if (!Number.isFinite(m)) return '—';
  if (a < 1) return `${(m * 100).toFixed(0)} cm`;
  if (a < 1e4) return `${m.toFixed(a < 100 ? 1 : 0)} m`;
  if (a < 1e8) return `${(m / 1e3).toLocaleString('en-US', { maximumFractionDigits: a < 1e5 ? 1 : 0 })} km`;
  if (a < 0.05 * AU) return `${formatNumber(m / 1e3, 4)} km`;
  if (a < 0.1 * LY) return `${(m / AU).toFixed(a < 10 * AU ? 3 : a < 1000 * AU ? 2 : 0)} AU`;
  if (a < 1e3 * LY) return `${(m / LY).toFixed(a < 10 * LY ? 3 : 2)} ly`;
  if (a < 1e6 * LY) return `${(m / LY / 1e3).toFixed(2)} kly`;
  if (a < 1e9 * LY) return `${(m / LY / 1e6).toFixed(2)} Mly`;
  return `${(m / LY / 1e9).toFixed(3)} Gly`;
}

export function formatSpeed(mps: number): string {
  const a = Math.abs(mps);
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

export function formatMass(kg: number): string {
  if (!(kg > 0)) return '—';
  const table: [number, string][] = [
    [1.98847e30, 'M☉'], [1.89813e27, 'M♃'], [5.9722e24, 'M⊕'], [7.342e22, 'M☾'],
  ];
  for (const [v, u] of table) {
    if (kg >= v * 0.1) return `${formatNumber(kg / v, 3)} ${u}  (${formatNumber(kg, 3)} kg)`;
  }
  return `${formatNumber(kg, 3)} kg`;
}

export function formatRadius(m: number): string {
  if (!(m > 0)) return '—';
  if (m >= 6.957e8 * 0.3) return `${formatNumber(m / 6.957e8, 3)} R☉  (${formatNumber(m / 1e3, 4)} km)`;
  if (m >= 1e6) return `${formatNumber(m / 1e3, 5)} km`;
  if (m >= 1e3) return `${(m / 1e3).toFixed(m < 1e4 ? 2 : 1)} km`;
  return `${m.toFixed(1)} m`;
}

export function formatTemperature(K: number): string {
  if (!Number.isFinite(K)) return '—';
  const c = K - 273.15;
  if (K > 5000) return `${Math.round(K).toLocaleString('en-US')} K`;
  return `${K.toFixed(K < 100 ? 1 : 0)} K  (${c.toFixed(0)} °C)`;
}

export function formatPeriod(s: number): string { return formatDuration(s); }

export { PC };
