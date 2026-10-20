/** Browser-only decorative field; no cursor replacement or animation dependency. */
export function mountDotGridWarp(surface: HTMLElement): () => void {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let stop: (() => void) | undefined;
  const update = () => {
    if (fine.matches && !reduced.matches) stop ??= createField(surface);
    else { stop?.(); stop = undefined; }
  };
  fine.addEventListener('change', update);
  reduced.addEventListener('change', update);
  update();
  return () => {
    stop?.();
    fine.removeEventListener('change', update);
    reduced.removeEventListener('change', update);
  };
}

function createField(surface: HTMLElement): () => void {
  const canvas = document.createElement('canvas');
  canvas.className = 'dot-grid-warp';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    pointerEvents: 'none', zIndex: '15', visibility: 'hidden',
  });
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const base = document.createElement('canvas');
  const baseCtx = base.getContext('2d');
  if (!baseCtx) return () => {};
  document.body.append(canvas);
  const gap = 26, reach = 150, push = 26, dotSize = 1;
  const reachSquared = reach * reach;
  let width = 0, height = 0, dpr = 1, frame = 0, last = 0;
  let pointerX = -1000, pointerY = -1000, x = -1000, y = -1000;
  let strength = 0, targetStrength = 0, destroyed = false;
  let pointerPresent = false;
  let layoutDirty = true, viewportDirty = true, hitDirty = false, interactive = false;
  let bounds = surface.getBoundingClientRect();
  let points: { x: number; y: number }[] = [];
  let rows: { x: number; y: number }[][] = [];
  type Area = { left: number; top: number; width: number; height: number };
  let previousArea: Area | null = null, fullPaint = true;
  const pathDot = (context: CanvasRenderingContext2D, cx: number, cy: number, radius: number) => {
    context.moveTo(cx + radius, cy); context.arc(cx, cy, radius, 0, Math.PI * 2);
  };
  const inside = () => pointerX >= bounds.left && pointerX <= bounds.right && pointerY >= bounds.top && pointerY <= bounds.bottom;
  const rebuild = () => {
    if (viewportDirty) {
      const box = canvas.getBoundingClientRect();
      width = box.width; height = box.height; dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(width * dpr), h = Math.round(height * dpr);
      // Reassigning either dimension destroys the entire bitmap, even unchanged.
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h; base.width = w; base.height = h;
      }
      viewportDirty = false;
    }
    bounds = surface.getBoundingClientRect();
    points = []; rows = [];
    const firstRow = Math.max(0, Math.floor((-bounds.top - gap / 2 - push) / gap));
    for (let row = firstRow; ; row++) {
      const cy = bounds.top + gap / 2 + row * gap;
      if (cy > Math.min(height + push, bounds.bottom)) break;
      const rowPoints: { x: number; y: number }[] = [];
      for (let cx = bounds.left + gap / 2; cx < Math.min(width + push, bounds.right); cx += gap) {
        const point = { x: cx, y: cy }; points.push(point); rowPoints.push(point);
      }
      rows.push(rowPoints);
    }
    baseCtx.setTransform(1, 0, 0, 1, 0, 0); baseCtx.clearRect(0, 0, base.width, base.height);
    baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0); baseCtx.save();
    baseCtx.beginPath(); baseCtx.rect(bounds.left, bounds.top, bounds.width, bounds.height); baseCtx.clip();
    baseCtx.fillStyle = '#FFFFFF'; baseCtx.beginPath();
    for (const point of points) pathDot(baseCtx, point.x, point.y, dotSize / 2);
    baseCtx.fill(); baseCtx.restore();
    targetStrength = pointerPresent && inside() ? 1 : 0;
    layoutDirty = false; fullPaint = true; previousArea = null;
  };
  const restore = (area: Area) => {
    ctx.clearRect(area.left, area.top, area.width, area.height);
    ctx.drawImage(base, area.left, area.top, area.width, area.height, area.left, area.top, area.width, area.height);
  };
  const draw = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fullPaint) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      fullPaint = false;
    } else if (previousArea) restore(previousArea);
    previousArea = null;
    if (strength > .001) {
      // Include maximum outward displacement and antialiasing in the patch.
      const radius = reach + push + dotSize * 3;
      const left = Math.max(0, Math.floor((x - radius) * dpr));
      const top = Math.max(0, Math.floor((y - radius) * dpr));
      const right = Math.min(canvas.width, Math.ceil((x + radius) * dpr));
      const bottom = Math.min(canvas.height, Math.ceil((y + radius) * dpr));
      if (right > left && bottom > top) {
        previousArea = { left, top, width: right - left, height: bottom - top };
        ctx.clearRect(left, top, right - left, bottom - top);
        ctx.save();
        ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.beginPath(); ctx.rect(bounds.left, bounds.top, bounds.width, bounds.height); ctx.clip();
        ctx.fillStyle = '#FFFFFF'; ctx.beginPath();
        const firstY = rows[0]?.[0]?.y ?? 0, firstX = rows[0]?.[0]?.x ?? 0;
        const minRow = Math.max(0, Math.floor((top / dpr - dotSize * 2 - firstY) / gap));
        const maxRow = Math.min(rows.length - 1, Math.ceil((bottom / dpr + dotSize * 2 - firstY) / gap));
        for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
          const row = rows[rowIndex];
          const minCol = Math.max(0, Math.floor((left / dpr - dotSize * 2 - firstX) / gap));
          const maxCol = Math.min(row.length - 1, Math.ceil((right / dpr + dotSize * 2 - firstX) / gap));
          for (let colIndex = minCol; colIndex <= maxCol; colIndex++) {
            const point = row[colIndex];
            const dx = point.x - x, dy = point.y - y, squared = dx * dx + dy * dy;
            if (squared >= reachSquared) { pathDot(ctx, point.x, point.y, dotSize / 2); continue; }
            const distance = Math.sqrt(squared);
            const influence = (1 - distance / reach) * strength;
            const ux = distance > .001 ? dx / distance : 1, uy = distance > .001 ? dy / distance : 0;
            pathDot(ctx, point.x + ux * push * influence, point.y + uy * push * influence, dotSize / 2 * (1 + influence * (interactive ? 2.35 : 2)));
          }
        }
        ctx.fill(); ctx.restore();
      }
    }
    canvas.style.visibility = 'visible';
  };
  const schedule = () => {
    if (!frame && !destroyed && !document.hidden) frame = requestAnimationFrame(tick);
  };
  const tick = (now: number) => {
    frame = 0;
    if (destroyed || document.hidden) return;
    if (layoutDirty || viewportDirty) rebuild();
    if (bounds.bottom <= 0 || bounds.top >= height || !width || !height) {
      canvas.style.visibility = 'hidden'; strength = 0; targetStrength = 0; last = 0; return;
    }
    if (hitDirty) {
      const hit = targetStrength ? document.elementFromPoint(pointerX, pointerY) : null;
      interactive = Boolean(hit?.closest('a, button, input'));
      canvas.dataset['interactive'] = String(interactive); hitDirty = false;
    }
    const dt = last ? Math.min(Math.max((now - last) / 1000, 0), .05) : 1 / 60;
    last = now;
    const amount = 1 - Math.exp(-20 * dt);
    x += (pointerX - x) * amount; y += (pointerY - y) * amount;
    strength += (targetStrength - strength) * amount;
    if (Math.abs(strength - targetStrength) <= .001) strength = targetStrength;
    const moving = Math.abs(x - pointerX) + Math.abs(y - pointerY) > .1;
    draw();
    if (strength !== targetStrength || (targetStrength > 0 && moving)) schedule();
    else last = 0;
  };
  const resize = () => { viewportDirty = true; layoutDirty = true; hitDirty = true; schedule(); };
  const move = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    pointerPresent = true;
    pointerX = event.clientX; pointerY = event.clientY;
    if (targetStrength === 0 && strength === 0) { x = pointerX; y = pointerY; }
    targetStrength = inside() ? 1 : 0;
    interactive = Boolean(event.target instanceof Element && event.target.closest('a, button, input'));
    canvas.dataset['interactive'] = String(interactive);
    if (bounds.bottom > 0 && bounds.top < height) schedule();
  };
  const leave = () => { pointerPresent = false; targetStrength = 0; schedule(); };
  const scroll = () => { layoutDirty = true; hitDirty = true; schedule(); };
  const visibility = () => {
    cancelAnimationFrame(frame); frame = 0; last = 0; pointerPresent = false; targetStrength = 0; strength = 0;
    if (!document.hidden) resize();
  };
  const observer = new ResizeObserver(resize); observer.observe(surface);
  window.addEventListener('pointermove', move, { passive: true });
  document.documentElement.addEventListener('pointerleave', leave);
  window.addEventListener('blur', leave); window.addEventListener('focus', resize);
  window.addEventListener('resize', resize); window.addEventListener('scroll', scroll, { passive: true, capture: true });
  document.addEventListener('visibilitychange', visibility);
  schedule();
  return () => {
    destroyed = true; cancelAnimationFrame(frame); observer.disconnect();
    window.removeEventListener('pointermove', move);
    document.documentElement.removeEventListener('pointerleave', leave);
    window.removeEventListener('blur', leave); window.removeEventListener('focus', resize);
    window.removeEventListener('resize', resize); window.removeEventListener('scroll', scroll, true);
    document.removeEventListener('visibilitychange', visibility); canvas.remove();
  };
}
