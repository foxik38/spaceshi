/** Physical constants and unit conversions. Everything in the simulation is SI (m, kg, s). */
export const G = 6.6743e-11;
export const C = 299_792_458;
export const SIGMA_SB = 5.670374419e-8;
export const AU = 149_597_870_700;
export const LY = 9_460_730_472_580_800;
export const PC = 3.0856775814913673e16;
export const M_SUN = 1.98847e30;
export const R_SUN = 6.957e8;
export const L_SUN = 3.828e26;
export const T_SUN = 5772;
export const M_EARTH = 5.9722e24;
export const R_EARTH = 6.3781e6;
export const M_JUP = 1.89813e27;
export const R_JUP = 7.1492e7;
export const SOLAR_CONSTANT = 1361; // W/m^2 at 1 AU
export const DAY = 86_400;
export const YEAR = 365.25 * DAY;
export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;
/** Mean obliquity of the ecliptic at J2000 (rotates ecliptic coordinates into the equatorial frame). */
export const OBLIQUITY = 23.4392911 * DEG;
/** Julian date of J2000.0. Simulation time is seconds since this epoch. */
export const J2000_JD = 2_451_545.0;
export const UNIX_J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
export const KM = 1000;
export const LY_PER_PC = PC / LY;
