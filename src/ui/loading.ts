import { h } from './dom';
import { t } from '../i18n';

const TIPS = [
  'Drag to look around. Scroll to change your flight speed — it scales with your distance to the nearest object.',
  'Press G to fly to anything you have selected; press / to search stars, galaxies, moons and spacecraft.',
  'Hold Z and scroll to zoom the field of view like a telescope.',
  'Grab a planet in Sandbox mode and fling it — gravity will do the rest.',
  'Everything you see is placed from real catalogues: 109,000 stars, 12,000 galaxies and 5,000 exoplanets.',
  'Speed up time with the . key. Try one year per second and watch the planets dance.',
];

export class Loading {
  el: HTMLElement;
  bar: HTMLElement;
  msg: HTMLElement;
  constructor() {
    this.bar = h('i');
    this.msg = h('div', { class: 'msg' }, t('Initialising…'));
    this.el = h('div', { id: 'loading' },
      h('h1', {}, 'SPACESHI'),
      h('div', { class: 'bar' }, this.bar),
      this.msg,
      h('div', { class: 'tip' }, t(TIPS[Math.floor(Math.random() * TIPS.length)])),
    );
    document.body.appendChild(this.el);
  }
  set(progress: number, message: string) {
    this.bar.style.width = `${Math.round(progress * 100)}%`;
    this.msg.textContent = t(message);
  }
  done() {
    this.el.classList.add('done');
    setTimeout(() => this.el.remove(), 1000);
  }
}
