import { DAY, J2000_JD, UNIX_J2000_MS, YEAR } from '../core/constants';
import { getLang } from '../i18n';

/** Simulation clock: seconds since J2000 (TT ≈ UTC for our purposes). */
export class SimClock {
  /** Simulation time in seconds since J2000. */
  t: number;
  /** Simulation seconds per real second (may be negative to run backwards). */
  rate = 1;
  paused = false;

  constructor() {
    this.t = (Date.now() - UNIX_J2000_MS) / 1000;
  }

  setNow() {
    this.t = (Date.now() - UNIX_J2000_MS) / 1000;
    this.rate = 1;
  }

  get jd() { return J2000_JD + this.t / DAY; }

  /** Returns a formatted UTC-like date string; falls back to years for out-of-range dates. */
  format(): string { return formatSimTime(this.t); }
}

export function formatSimTime(t: number): string {
  const ms = UNIX_J2000_MS + t * 1000;
  const cs = getLang() === 'cs';
  if (Math.abs(ms) < 8.6e15) {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const p = (n: number) => String(n).padStart(2, '0');
    const time = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
    if (cs) {
      // Czech long-hand date: 29. 9. 2026 00:37:19 (BCE years count back from 1 př. n. l., like the astronomical -y + 1)
      const yy = y < 0 ? `${-y + 1} př. n. l.` : String(y);
      return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}. ${yy}  ${time}`;
    }
    const yy = y < 0 ? `${-y + 1} BCE` : String(y).padStart(4, '0');
    return `${yy}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}  ${time}`;
  }
  const years = 2000 + t / YEAR;
  if (cs) return years > 0 ? `rok ${years.toExponential(3).replace('.', ',')}` : `${(-years).toExponential(3).replace('.', ',')} let př. n. l.`;
  return years > 0 ? `year ${years.toExponential(3)}` : `${(-years).toExponential(3)} years BCE`;
}

/** Julian centuries since J2000. */
export const centuries = (t: number) => t / (36525 * DAY);

export const RATE_STEPS: { label: string; value: number }[] = [
  { label: '1×', value: 1 },
  { label: '1 min/s', value: 60 },
  { label: '10 min/s', value: 600 },
  { label: '1 hr/s', value: 3600 },
  { label: '6 hr/s', value: 6 * 3600 },
  { label: '1 day/s', value: DAY },
  { label: '1 wk/s', value: 7 * DAY },
  { label: '1 mo/s', value: 30.4375 * DAY },
  { label: '1 yr/s', value: YEAR },
  { label: '10 yr/s', value: 10 * YEAR },
  { label: '100 yr/s', value: 100 * YEAR },
  { label: '1 kyr/s', value: 1e3 * YEAR },
  { label: '10 kyr/s', value: 1e4 * YEAR },
  { label: '100 kyr/s', value: 1e5 * YEAR },
  { label: '1 Myr/s', value: 1e6 * YEAR },
];
