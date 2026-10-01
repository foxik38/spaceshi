import type { Selectable } from '../app/selectable';

export interface SearchResult {
  key: string;
  name: string;
  type: string;
  kind: string;
  distance: string;
  make: () => Selectable;
}

/** What the UI needs from the application. */
export interface AppAPI {
  search(q: string): SearchResult[];
  select(s: Selectable | null): void;
  gotoSelected(): void;
  orbitSelected(): void;
  stepRate(dir: 1 | -1): void;
  togglePause(): void;
  reverseTime(): void;
  timeNow(): void;
  rateLabel(): string;
  dateLabel(): string;
  paused(): boolean;
  setLayer(key: string, on: boolean): void;
  getLayer(key: string): boolean;
  setSetting(key: string, v: number): void;
  getSetting(key: string): number;
  goHome(): void;
  photoMode(): void;
  hasSandbox: boolean;
}
