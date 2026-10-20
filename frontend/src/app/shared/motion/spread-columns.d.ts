export interface SpreadFrame {
  ctx: CanvasRenderingContext2D;
  t: number;
  width: number;
  height: number;
  params: Record<string, string | number | boolean>;
  images: (HTMLImageElement | undefined)[];
  background: HTMLImageElement | null;
}
declare const template: { id: string; defaultDuration: number; slotCount: number; render(frame: SpreadFrame): void };
export default template;
