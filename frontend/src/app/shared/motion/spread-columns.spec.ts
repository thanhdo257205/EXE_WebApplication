import TEMPLATE from './spread-columns.js';
import { SPREAD_PARAMS } from '../components/column-spread/column-spread.component';

function trace(t: number, scale = 1) {
  const cards: unknown[][] = [];
  const images = Array.from({ length: 12 }, (_, slot) => ({ width: 512, height: 512, slot })) as unknown as HTMLImageElement[];
  const ctx = new Proxy({ drawImage: (...args: unknown[]) => cards.push(args) }, {
    get(target, key) { return key in target ? target[key as keyof typeof target] : () => {}; },
    set() { return true; },
  }) as unknown as CanvasRenderingContext2D;
  TEMPLATE.render({ ctx, t, width: 784 * scale, height: 441 * scale, params: SPREAD_PARAMS, images, background: null });
  return cards.map(([image, ...coordinates]) => ({
    slot: images.indexOf(image as HTMLImageElement),
    coordinates: (coordinates as number[]).map(value => Math.round(value * 1e6) / 1e6),
  }));
}

describe('User-supplied Column Spread rendering invariants', () => {
  it('closes the loop without changing the visible card order or geometry', () => {
    expect(trace(0)).toEqual(trace(1));
  });
  it('uses deterministic image ordering across repeated renders', () => {
    expect(trace(.35)).toEqual(trace(.35));
    expect(trace(.35).every(card => card.slot >= 0 && card.slot < 12)).toBe(true);
  });
  it('keeps media crop and order while scaling destination geometry with its container', () => {
    const normal = trace(.5), doubled = trace(.5, 2);
    expect(doubled.length).toBe(normal.length);
    doubled.forEach((card, index) => {
      expect(card.slot).toBe(normal[index].slot);
      card.coordinates.slice(0, 4).forEach((coordinate, n) => expect(coordinate).toBeCloseTo(normal[index].coordinates[n], 5));
      card.coordinates.slice(4).forEach((coordinate, n) => expect(coordinate).toBeCloseTo(normal[index].coordinates[n + 4] * 2, 5));
    });
  });
  it('has distinct stacked and spread phases', () => {
    expect(trace(.12)).not.toEqual(trace(.5));
  });
});
