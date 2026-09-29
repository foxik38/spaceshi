# Spaceshi

A realistic 3D universe sandbox that runs entirely in the browser. You are a free-floating observer, not a ship: fly from low orbit around Earth to the Milky Way's core and out to thousands of galaxies, look at anything, and reach into the Solar System to move planets or add new ones under live gravity.

No backend, no accounts, no telemetry. `npm start` serves a static site.

## Highlights

- **The real sky.** 109,400 catalogue stars (with proper motion inside ~106 ly), 3,800 exoplanet systems, 12,000+ deep-sky objects (galaxies, nebulae, clusters), all 88 constellations, the Milky Way seen from inside and outside, and a cosmic-web backdrop.
- **The real Solar System.** The eight planets with JPL orbital elements and IAU poles and rotation, Pluto and the dwarf planets, ~110 moons, notable asteroids, comets (with tails), interstellar visitors, belts (main, Hildas, Trojans, Kuiper, Oort), Starlink/GPS/GEO shells and famous spacecraft.
- **Star systems on demand.** Fly to a star and it grows a planetary system: real planets from the Open Exoplanet Catalogue where known, physically plausible procedural ones elsewhere.
- **Compact objects.** Black holes are ray-traced through Schwarzschild geodesics: gravitational lensing of the sky, photon ring, and a Doppler-beamed accretion disc. Sgr A\*, M87\*, Cygnus X-1, TON 618, Gaia BH1/BH3, pulsars and more.
- **Live N-body sandbox.** Select anything and grab it, throw it, change its mass or velocity, circularise its orbit, delete it, or add planets, moons, stars and black holes. A symplectic Yoshida-4 integrator keeps orbits honest; collisions merge bodies and conserve momentum.
- **Every object has stats.** Type, mass, radius, gravity, temperature, rotation, orbit (osculating for edited bodies), distance from you, and a short description.
- **Movement that feels good.** Distance-scaled free flight, orbit mode, cinematic "go to" travel across 20 orders of magnitude, sphere-of-influence frames that co-move with what you're near, and a telescope zoom.

## Quick start

Node 20 or newer.

```bash
npm install
npm start          # builds on first run, then serves http://localhost:8080
```

Other ways to run it:

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload on :5173 |
| `npm run build` | Typecheck and produce `dist/` |
| `npm start` | Zero-dependency static server for `dist/` (brotli/gzip, immutable caching). `PORT=3000 HOST=127.0.0.1 npm start` to change binding |
| `docker build -t spaceshi . && docker run -p 8080:8080 spaceshi` | Same server in a container |
| `npm test` | Ephemeris, Kepler and physics tests |
| `npm run data` | Re-download source catalogues and regenerate `public/data/` |

`npm start` prints your LAN addresses, so you can open the game from another machine on your network. To host it publicly, put `dist/` behind any static host or reverse proxy; there is nothing server-side to secure.

### Requirements

A desktop browser with **WebGL 2** and hardware acceleration (current Chrome, Edge or Firefox). A discrete or recent integrated GPU is recommended. *Adaptive resolution* (Settings, on by default) supersamples up to 1.5x on standard-DPI screens for cleaner edges and finer detail, and steps the internal resolution down automatically if the frame rate drops; *Render scale* is a manual multiplier on top.

## Controls

| | |
|---|---|
| **Look** | Drag with the mouse |
| **Fly** | `W` `A` `S` `D`, `R`/`F` up/down, `Q`/`E` roll, `Shift` boost, `Ctrl` fine control |
| **Speed** | Mouse wheel (or zoom when orbiting). Speed scales automatically with distance to the nearest object |
| **Telescope** | Hold `Z`, scroll to zoom |
| **Search** | `/` (stars, planets, moons, galaxies, spacecraft…) |
| **Select / go to** | Click selects; double-click or `G` flies to the selection; `C` orbits it; `Backspace` returns to the previous target; `Home` shows the whole Solar System; `Esc` deselects |
| **Time** | `Space` pause, `,` / `.` slower / faster (up to one million years per second), `B` reverse, `T` jump to now |
| **Interface** | `L` labels, `O` orbit paths, `U` hide interface, `P` photo mode, `H` help |

Orbit paths of moons and satellites are hidden by default so planets stay clean; enable them under *Layers → Orbits around planets and moons*. Select a body and use the **Sandbox** tools in the left toolbar to edit it.

## How it works

- **Precision.** Positions live on the CPU in double precision (SI units, ICRS axes, Sun at the origin) and everything is rendered camera-relative, so a metre-sized error never appears at any of the ~30 orders of magnitude the scene spans.
- **Painter's algorithm, no depth buffer.** Each resolved body is a single screen-aligned quad whose fragment shader ray-casts an analytic (oblate or triaxial) ellipsoid: procedural terrain, gas-giant bands and storms, Earth textures with clouds and city lights, single-scattering atmospheres, rings with mutual shadows, eclipses, and analytic limb anti-aliasing. Bodies are drawn far to near, which sidesteps the depth-precision problems of huge scenes.
- **Detail without polygons.** Because bodies are analytic surfaces rather than meshes, there is no polygon count to raise: the shader adds noise octaves, crater generations, ringlets and granules until a feature would be smaller than about a pixel, then hands over to metre-scale ground detail. Zooming in keeps revealing structure instead of running out of texture.
- **Photometric sky.** Stars and unresolved planets are drawn from absolute magnitude and distance, exposure adapts to local light like an eye, and an HDR pipeline (dual-filter bloom, ACES tone mapping, dither) finishes the frame.
- **Physics.** Planets and moons follow analytic Keplerian rails until you touch anything; then the Yoshida-4 symplectic integrator takes over for massive bodies, with sub-stepped test particles for small ones, adaptive to time warp.
- **Black holes.** Each pixel integrates a null geodesic in `u = 1/r` (`u'' = −u + 1.5u²`) and resamples a snapshot of the already-rendered sky, so lensing works for the entire scene.

Source layout: `src/sim` (bodies, ephemerides, physics), `src/data` (catalogues and the Solar System), `src/render` (shaders and layers), `src/nav` (camera rig), `src/app` (sandbox, selection, audio), `src/ui` (HUD).

## Data and credits

Generated catalogue files in `public/data/` are built by `scripts/build-data.mjs` from:

| Source | Used for | Licence (per upstream) |
|---|---|---|
| [HYG Database v4.1](https://github.com/astronexus/HYG-Database) | 109,400 stars | CC BY-SA 4.0 |
| [OpenNGC](https://github.com/mattiaverga/OpenNGC) | NGC/IC/Messier objects | CC BY-SA 4.0 |
| [Open Exoplanet Catalogue](https://github.com/OpenExoplanetCatalogue/oec_tables) | Exoplanet systems | MIT |
| [Stellarium](https://github.com/Stellarium/stellarium) modern sky culture | Constellation lines | see upstream |
| JPL "Approximate Positions of the Planets" and IAU WGCCRE reports | Planet orbits, poles, rotation | public domain / published constants |

The Earth and Moon textures in `public/textures/` come from the [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets). Check their upstream terms before redistributing the project commercially. Every other surface (Mars, Jupiter, Saturn, asteroids, exoplanets…) is procedural.

Licences above are as stated by the upstream projects; verify them if you redistribute the data.

## Accuracy and limitations

Spaceshi aims for believable physics and correct scales, not survey-grade astrometry.

- Planet positions use JPL's approximate polynomials (arcminute-level for 1800–2050, degrading outside); moons use mean elements. Tests check Earth at J2000, Mars in 2003 and the new Moon.
- Star systems beyond the ~5,000 with measured planets are procedural. Exoplanet appearance is inferred from mass, radius and equilibrium temperature.
- The sky beyond ~100 ly uses catalogue positions with a procedural Milky Way and cosmic web; galaxies and nebulae are illustrative sprites, not photographs.
- Fullscreen black-hole shading is GPU-heavy; with software rendering it will crawl.
- No relativistic time dilation is modelled outside the black-hole optics.

## Development

```bash
npm run dev         # hot-reload dev server
npm run typecheck
npm test
```

Developer helpers in `scripts/`: `screenshot.mjs` and `tour.mjs` capture headless views through Playwright with software GL (append `?quality=fixed` to the URL to disable adaptive resolution), and `window.__app.view('jupiter', 3, 60, 10)` jumps the camera in the browser console.

## Licence

MIT for the source code (see `LICENSE`). Data and textures keep their upstream licences as listed above.
