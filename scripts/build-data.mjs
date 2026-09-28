#!/usr/bin/env node
/**
 * Builds the compact runtime data files in public/data from open astronomy catalogues.
 *
 *   npm run data            # downloads sources into .cache/ (once) and regenerates public/data
 *
 * Sources (all fetched from GitHub):
 *   - HYG Database v4.1 (astronexus)       CC BY-SA 4.0   -> stars.bin, stars-meta.json
 *   - OpenNGC (mattiaverga)                CC BY-SA 4.0   -> dso.json
 *   - Open Exoplanet Catalogue             MIT            -> exo.json
 *
 * The generated files are committed so the game works without running this script.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache');
const OUT = join(ROOT, 'public', 'data');
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

const SOURCES = {
  'hyg.csv': 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv',
  'ngc.csv': 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv',
  'addendum.csv': 'https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/addendum.csv',
  'oec.csv': 'https://raw.githubusercontent.com/OpenExoplanetCatalogue/oec_tables/master/comma_separated/open_exoplanet_catalogue.txt',
};

async function fetchSource(name) {
  const p = join(CACHE, name);
  if (!existsSync(p)) {
    console.log('downloading', name);
    const res = await fetch(SOURCES[name]);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(p, 'utf8');
}

/** RFC-4180-ish CSV parser with configurable delimiter. */
function parseCSV(text, delim = ',') {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const PC_LY = 3.261563777;
const DEG = Math.PI / 180;
const num = (s) => (s === '' || s === undefined ? NaN : Number(s));
const r = (v, d) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

// ---------------------------------------------------------------- stars (HYG)
async function buildStars() {
  const rows = parseCSV(await fetchSource('hyg.csv'));
  const stars = [];
  for (const s of rows) {
    if (s.proper === 'Sol') continue;
    const dist = num(s.dist);
    if (!(dist > 0) || dist >= 99999) continue; // no usable parallax
    stars.push({
      x: num(s.x) * PC_LY, y: num(s.y) * PC_LY, z: num(s.z) * PC_LY,
      vx: num(s.vx) * PC_LY, vy: num(s.vy) * PC_LY, vz: num(s.vz) * PC_LY,
      distPc: dist, mag: num(s.mag), absmag: num(s.absmag), ci: num(s.ci),
      spect: s.spect, lum: num(s.lum), proper: s.proper, con: s.con,
      hip: s.hip, hd: s.hd, gl: s.gl, bf: s.bf, hr: s.hr, ra: num(s.ra), dec: num(s.dec),
      comp: s.comp, base: s.base,
    });
  }
  // nearest first so that stars <= ~105 ly form a prefix (they carry proper motion)
  stars.sort((a, b) => a.distPc - b.distPc);
  const NEAR_PC = 32.5;
  const nNear = stars.filter((s) => s.distPc <= NEAR_PC).length;
  const rest = stars.splice(nNear);
  rest.sort((a, b) => a.mag - b.mag);
  const all = stars.concat(rest);
  const n = all.length;

  const buf = new ArrayBuffer(8 + n * 5 * 4 + nNear * 3 * 4);
  const dv = new DataView(buf);
  dv.setUint32(0, n, true);
  dv.setUint32(4, nNear, true);
  const f = new Float32Array(buf, 8, n * 5);
  const v = new Float32Array(buf, 8 + n * 5 * 4, nNear * 3);
  all.forEach((s, i) => {
    f[i * 5] = s.x; f[i * 5 + 1] = s.y; f[i * 5 + 2] = s.z;
    f[i * 5 + 3] = Number.isFinite(s.absmag) ? s.absmag : 12;
    f[i * 5 + 4] = Number.isFinite(s.ci) ? s.ci : 99; // 99 = unknown -> derive from spectral type
    if (i < nNear) { v[i * 3] = s.vx || 0; v[i * 3 + 1] = s.vy || 0; v[i * 3 + 2] = s.vz || 0; }
  });
  writeFileSync(join(OUT, 'stars.bin'), Buffer.from(buf));

  // metadata for stars worth naming: near, named, or naked-eye
  const meta = [];
  all.forEach((s, i) => {
    const named = s.proper || s.bf || s.gl;
    if (i < nNear || s.proper || s.mag < 4.6) {
      const id = s.proper || (s.bf ? s.bf.trim() : '') || s.gl || (s.hd ? 'HD ' + s.hd : s.hip ? 'HIP ' + s.hip : '');
      if (!id && !named) return;
      meta.push([
        i, id, s.spect, r(s.mag, 2), r(s.lum, 4), s.con,
        s.hip ? Number(s.hip) : 0, s.hd ? Number(s.hd) : 0, s.gl, r(s.distPc * PC_LY, 3), s.comp === '' ? 1 : Number(s.comp),
      ]);
    }
  });
  writeFileSync(join(OUT, 'stars-meta.json'), JSON.stringify({
    fields: ['index', 'name', 'spect', 'mag', 'lum', 'con', 'hip', 'hd', 'gl', 'distLy', 'comp'],
    count: n, near: nNear, rows: meta,
  }));
  console.log(`stars: ${n} (near ${nNear}), meta rows ${meta.length}, bin ${(buf.byteLength / 1e6).toFixed(2)} MB`);
}

// ------------------------------------------------ deep sky objects (OpenNGC)
const KNOWN_LY = {
  // Messier objects: distance in light-years (approximate, literature values)
  M1: 6500, M2: 37500, M3: 33900, M4: 7200, M5: 24500, M6: 1600, M7: 980, M8: 4100, M9: 25800, M10: 14300,
  M11: 6200, M12: 16000, M13: 22200, M14: 30300, M15: 33600, M16: 7000, M17: 5500, M18: 4900, M19: 28700, M20: 5200,
  M21: 4250, M22: 10600, M23: 2150, M24: 10000, M25: 2000, M26: 5000, M27: 1360, M28: 17900, M29: 4000, M30: 27100,
  M31: 2537000, M32: 2490000, M33: 2730000, M34: 1500, M35: 2800, M36: 4100, M37: 4500, M38: 4200, M39: 800,
  M41: 2300, M42: 1344, M43: 1600, M44: 610, M45: 444, M46: 5400, M47: 1600, M48: 2500, M49: 56e6, M50: 3200,
  M51: 23e6, M52: 5000, M53: 58000, M54: 87000, M55: 17600, M56: 32900, M57: 2300, M58: 65e6, M59: 60e6, M60: 55e6,
  M61: 52e6, M62: 22500, M63: 29e6, M64: 17e6, M65: 35e6, M66: 36e6, M67: 2700, M68: 33600, M69: 29700, M70: 29400,
  M71: 13000, M72: 53000, M74: 32e6, M75: 67500, M76: 2500, M77: 47e6, M78: 1600, M79: 42000, M80: 32600,
  M81: 12e6, M82: 12e6, M83: 15e6, M84: 60e6, M85: 60e6, M86: 52e6, M87: 53.5e6, M88: 47e6, M89: 50e6, M90: 58e6,
  M91: 63e6, M92: 26700, M93: 3600, M94: 16e6, M95: 38e6, M96: 31e6, M97: 2030, M98: 44e6, M99: 50e6, M100: 55e6,
  M101: 21e6, M102: 44e6, M103: 8500, M104: 31e6, M105: 38e6, M106: 24e6, M107: 20900, M108: 46e6, M109: 83e6, M110: 2700000,
};
const KNOWN_NAME_LY = {
  NGC7293: 655, NGC6543: 3300, NGC2392: 6500, NGC3132: 2000, NGC6826: 2200, NGC7009: 2500, NGC2244: 5200, NGC2237: 5200,
  NGC2070: 160000, NGC3372: 8500, NGC6334: 5500, NGC7000: 2590, IC0434: 1375, IC1396: 2400, NGC5139: 17090, NGC0104: 14700,
  NGC6397: 7800, NGC6752: 13000, NGC0869: 7500, NGC0884: 7600, NGC3532: 1300, NGC2516: 1300, IC2602: 500, NGC6231: 5200,
  NGC4755: 6440, NGC0253: 11.4e6, NGC0300: 6.1e6, NGC4565: 43e6, NGC0891: 30e6, NGC5128: 12e6, NGC6946: 22e6, NGC1300: 61e6,
  NGC1365: 56e6, NGC4038: 62e6, NGC4039: 62e6, NGC3628: 35e6, NGC2403: 8e6, NGC4631: 25e6, NGC7331: 45e6, NGC2841: 46e6,
  NGC1232: 61e6, NGC6744: 30e6, NGC5907: 50e6, IC1613: 2.4e6, NGC6822: 1.6e6, NGC0185: 2.0e6, NGC0147: 2.5e6, NGC0292: 200000,
  NGC0752: 1300, NGC2264: 2600, NGC1499: 1000, NGC2024: 1350, NGC1977: 1500, NGC6888: 5000, NGC7635: 7100, NGC6992: 2400,
  NGC6960: 2400, NGC2359: 12000, NGC7380: 7200, NGC1333: 980, NGC6611: 7000, NGC2632: 610, IC2944: 6000, NGC3603: 20000,
  NGC6357: 5500, NGC6530: 4100, NGC1275: 237e6, NGC4486: 53.5e6, NGC4472: 55e6, NGC5194: 23e6, NGC5195: 23e6,
};
const DSO_TYPE = { G: 'galaxy', GPair: 'galaxy', GTrpl: 'galaxy', GGroup: 'galaxy', OCl: 'open_cluster', GCl: 'globular_cluster',
  PN: 'planetary_nebula', Neb: 'nebula', HII: 'hii_region', 'Cl+N': 'cluster_nebula', RfN: 'reflection_nebula', EmN: 'emission_nebula',
  SNR: 'supernova_remnant', Nova: 'nova', '*Ass': 'association', DrkN: 'dark_nebula' };
// Typical physical diameters (ly) used to estimate distance from angular size when nothing better is known.
const TYPICAL_DIAMETER_LY = { open_cluster: 20, globular_cluster: 140, planetary_nebula: 1.6, nebula: 60, hii_region: 90,
  cluster_nebula: 90, reflection_nebula: 12, emission_nebula: 60, supernova_remnant: 60, nova: 5, association: 120, dark_nebula: 40, galaxy: 60000 };

function parseRA(s) { const [h, m, sec] = s.split(':').map(Number); return (h + m / 60 + sec / 3600) * 15; }
function parseDec(s) {
  const sign = s.startsWith('-') ? -1 : 1;
  const [d, m, sec] = s.replace(/^[+-]/, '').split(':').map(Number);
  return sign * (d + m / 60 + sec / 3600);
}

async function buildDSO() {
  const rows = parseCSV(await fetchSource('ngc.csv'), ';').concat(parseCSV(await fetchSource('addendum.csv'), ';'));
  const out = [];
  for (const o of rows) {
    const type = DSO_TYPE[o.Type];
    if (!type || !o.RA || !o.Dec) continue;
    const name = o.Name;
    const messier = o.M ? 'M' + Number(o.M) : '';
    const common = (o['Common names'] || '').split(',')[0].trim();
    const majAx = num(o.MajAx), minAx = num(o.MinAx);
    let distLy = NaN, est = 0;
    if (messier && KNOWN_LY[messier]) distLy = KNOWN_LY[messier];
    else if (KNOWN_NAME_LY[name]) distLy = KNOWN_NAME_LY[name];
    else if (num(o.Pax) > 0.05) distLy = (1000 / num(o.Pax)) * PC_LY;
    else if (type === 'galaxy') {
      const z = num(o.Redshift);
      if (z > 0.0009) distLy = ((299792.458 * z) / 70) * 3.261563777e6; // Hubble flow, H0 = 70
    }
    if (!Number.isFinite(distLy)) {
      // rough estimate from angular size: distance = typical diameter / angle
      const arcmin = majAx > 0 ? majAx : type === 'galaxy' ? 0.6 : 3;
      let diam = TYPICAL_DIAMETER_LY[type] ?? 40;
      if (type === 'galaxy') diam = 20000 + Math.min(80000, 8000 * Math.pow(arcmin, 0.35));
      distLy = diam / (arcmin * (Math.PI / 180 / 60));
      est = 1;
      if (type !== 'galaxy') distLy = Math.min(Math.max(distLy, 300), 60000);
      else distLy = Math.min(distLy, 4e8);
    }
    const idText = name.replace(/^(NGC|IC)0*/, '$1 ').replace(/^(NGC|IC) (\d)/, '$1 $2');
    out.push([
      idText, messier, common, o.Type, r(parseRA(o.RA), 4), r(parseDec(o.Dec), 4), Math.round(distLy),
      r(majAx, 2), r(minAx, 2), Number.isFinite(num(o.PosAng)) ? Math.round(num(o.PosAng)) : null,
      r(Number.isFinite(num(o['V-Mag'])) ? num(o['V-Mag']) : num(o['B-Mag']), 2), o.Hubble || '', est,
    ]);
  }
  writeFileSync(join(OUT, 'dso.json'), JSON.stringify({
    fields: ['id', 'messier', 'common', 'type', 'ra', 'dec', 'distLy', 'majArcmin', 'minArcmin', 'posAngle', 'mag', 'hubble', 'estimated'],
    rows: out,
  }));
  console.log('deep-sky objects:', out.length);
}

// --------------------------------------------------------- exoplanets (OEC)
function parseRAhms(s) { const p = s.trim().split(/\s+/).map(Number); return (p[0] + (p[1] || 0) / 60 + (p[2] || 0) / 3600) * 15; }
function parseDecdms(s) {
  const t = s.trim(); const sign = t.startsWith('-') ? -1 : 1;
  const p = t.replace(/^[+-]/, '').split(/\s+/).map(Number);
  return sign * (p[0] + (p[1] || 0) / 60 + (p[2] || 0) / 3600);
}
async function buildExo() {
  const rows = parseCSV(await fetchSource('oec.csv'));
  const systems = new Map();
  for (const p of rows) {
    if (p.list && !/Confirmed/i.test(p.list)) continue;
    const dist = num(p.system_distance);
    if (!(dist > 0) || !p.system_rightascension || !p.system_declination) continue;
    const name = p.name.trim();
    const host = name.replace(/\s+[b-z]$/i, '').replace(/\s+\(.*\)$/, '');
    const key = host + '|' + p.system_rightascension;
    let s = systems.get(key);
    if (!s) {
      s = {
        n: host, ra: r(parseRAhms(p.system_rightascension), 4), dec: r(parseDecdms(p.system_declination), 4), d: r(dist, 3),
        m: r(num(p.hoststar_mass), 3), r: r(num(p.hoststar_radius), 3), t: r(num(p.hoststar_temperature), 0),
        met: r(num(p.hoststar_metallicity), 2), age: r(num(p.hoststar_age), 2), p: [],
      };
      systems.set(key, s);
    }
    // [name, massMj, radiusRj, periodDays, aAU, ecc, incDeg, tempK, discoveredYear, method, periastronDeg, ascNodeDeg]
    s.p.push([
      name, r(num(p.mass), 5), r(num(p.radius), 4), r(num(p.period), 6), r(num(p.semimajoraxis), 5), r(num(p.eccentricity), 4),
      r(num(p.inclination), 2), r(num(p.temperature), 0), num(p.discoveryyear) || null, p.discoverymethod || null,
      r(num(p.periastron), 1), r(num(p.ascendingnode), 1),
    ]);
  }
  const list = [...systems.values()].sort((a, b) => a.d - b.d);
  writeFileSync(join(OUT, 'exo.json'), JSON.stringify({ systems: list }));
  console.log('exoplanet systems:', list.length, 'planets:', list.reduce((n, s) => n + s.p.length, 0));
}

await buildStars();
await buildDSO();
await buildExo();
