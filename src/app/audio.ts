/**
 * Generative ambience (WebAudio, no asset files).
 *
 * Space is silent, so this is deliberately abstract: a slow detuned pad, a sub-bass rumble that swells near massive
 * bodies, a throbbing infrasonic pulse close to black holes and a band-passed "wind" that follows how fast you move.
 * Off by default; the preference is remembered and re-armed on the first click/keypress (browsers block autoplay).
 */
export interface AmbienceState {
  /** Speed of the viewer (m/s). */
  speed: number;
  /** Altitude above the nearest body divided by its radius (∞ when far away). */
  altitudeRatio: number;
  kind: string;
  /** log10 of the nearest body's mass (kg); drives the depth of the rumble. */
  logMass: number;
}

const STORE = 'spaceshi.audio';

function noiseBuffer(ctx: AudioContext, kind: 'brown' | 'pink', seconds = 4): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else { b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
  }
  // crossfade the loop seam so the noise never clicks
  const f = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < f; i++) { const t = i / f; d[n - f + i] = d[n - f + i] * (1 - t) + d[i] * t; }
  return buf;
}

export class Ambience {
  enabled = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private rumble!: GainNode;
  private wind!: GainNode;
  private windBand!: BiquadFilterNode;
  private pulse!: GainNode;
  private padFilter!: BiquadFilterNode;
  private padGain!: GainNode;
  private armed = false;

  constructor() {
    let stored = false;
    try { stored = localStorage.getItem(STORE) === '1'; } catch { /* storage may be blocked */ }
    if (stored) this.armOnGesture();
  }

  /** True while the saved preference waits for the first user gesture. */
  get pending() { return this.armed; }

  get supported() { return typeof AudioContext !== 'undefined'; }

  private armOnGesture() {
    if (this.armed) return;
    this.armed = true;
    const go = () => {
      window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go);
      this.armed = false;
      this.set(true, false);
    };
    window.addEventListener('pointerdown', go); window.addEventListener('keydown', go);
  }

  set(on: boolean, remember = true) {
    if (remember) { try { localStorage.setItem(STORE, on ? '1' : '0'); } catch { /* ignore */ } }
    if (!this.supported) return;
    if (on) {
      this.build();
      void this.ctx!.resume();
      this.master.gain.setTargetAtTime(0.55, this.ctx!.currentTime, 0.8);
      this.enabled = true;
    } else if (this.ctx) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
      this.enabled = false;
      const c = this.ctx;
      setTimeout(() => { if (!this.enabled) void c.suspend(); }, 1500);
    } else this.enabled = false;
  }

  private build() {
    if (this.ctx) return;
    const ctx = (this.ctx = new AudioContext({ latencyHint: 'playback' }));
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    // pad: slightly detuned open fifths, slowly breathing low-pass
    this.padFilter = ctx.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 420; this.padFilter.Q.value = 0.6;
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0.16;
    this.padFilter.connect(this.padGain).connect(this.master);
    for (const [f, g] of [[55, 0.5], [55.35, 0.4], [82.4, 0.3], [110.6, 0.22], [164.9, 0.12], [220.3, 0.06]] as const) {
      const o = ctx.createOscillator(); o.type = f < 100 ? 'triangle' : 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.03 + Math.random() * 0.07;
      const lg = ctx.createGain(); lg.gain.value = g * 0.5;
      lfo.connect(lg).connect(og.gain);
      o.connect(og).connect(this.padFilter);
      o.start(); lfo.start();
    }
    const sweep = ctx.createOscillator(); sweep.frequency.value = 0.045;
    const sweepGain = ctx.createGain(); sweepGain.gain.value = 160;
    sweep.connect(sweepGain).connect(this.padFilter.frequency); sweep.start();

    // rumble: brown noise, low-passed
    const rumbleSrc = ctx.createBufferSource(); rumbleSrc.buffer = noiseBuffer(ctx, 'brown'); rumbleSrc.loop = true;
    const rumbleLp = ctx.createBiquadFilter(); rumbleLp.type = 'lowpass'; rumbleLp.frequency.value = 110;
    this.rumble = ctx.createGain(); this.rumble.gain.value = 0.02;
    rumbleSrc.connect(rumbleLp).connect(this.rumble).connect(this.master); rumbleSrc.start();

    // wind: pink noise through a moving band-pass
    const windSrc = ctx.createBufferSource(); windSrc.buffer = noiseBuffer(ctx, 'pink'); windSrc.loop = true;
    this.windBand = ctx.createBiquadFilter(); this.windBand.type = 'bandpass'; this.windBand.frequency.value = 300; this.windBand.Q.value = 0.9;
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    windSrc.connect(this.windBand).connect(this.wind).connect(this.master); windSrc.start();

    // black-hole pulse: infrasonic-ish tone with a slow tremolo
    const bh = ctx.createOscillator(); bh.frequency.value = 36;
    const bhTrem = ctx.createGain(); bhTrem.gain.value = 0.5;
    const trem = ctx.createOscillator(); trem.frequency.value = 0.38;
    const tremDepth = ctx.createGain(); tremDepth.gain.value = 0.5;
    trem.connect(tremDepth).connect(bhTrem.gain);
    this.pulse = ctx.createGain(); this.pulse.gain.value = 0;
    bh.connect(bhTrem).connect(this.pulse).connect(this.master); bh.start(); trem.start();
  }

  update(s: AmbienceState) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const closeness = Math.max(0, Math.min(1, 1 - Math.log10(Math.max(s.altitudeRatio, 1)) / 2.2));
    const heft = Math.max(0, Math.min(1, (s.logMass - 22) / 8));                // moon .. Sun
    const speedN = Math.max(0, Math.min(1, (Math.log10(Math.max(s.speed, 1)) - 3) / 6));
    this.rumble.gain.setTargetAtTime(0.02 + 0.30 * closeness * (0.35 + 0.65 * heft), t, 0.6);
    this.wind.gain.setTargetAtTime(0.16 * speedN * speedN, t, 0.35);
    this.windBand.frequency.setTargetAtTime(180 + 2400 * speedN, t, 0.35);
    this.pulse.gain.setTargetAtTime(s.kind === 'black_hole' ? 0.34 * closeness : s.kind === 'neutron_star' ? 0.12 * closeness : 0, t, 0.8);
    this.padGain.gain.setTargetAtTime(0.16 * (1 - 0.45 * closeness), t, 1.2);
  }
}
