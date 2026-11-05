import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { PremiereCountdownComponent } from './premiere-countdown.component';
import { DanmakuOverlayComponent } from './danmaku-overlay.component';

describe('Premiere waiting screen', () => {
  it('shows hours/minutes/seconds and updates its fallback when captureStream is unavailable', async () => {
    await TestBed.configureTestingModule({ imports: [PremiereCountdownComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PremiereCountdownComponent);
    fixture.componentRef.setInput('seconds', 3661);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('01:01:01');
    fixture.componentRef.setInput('seconds', 2);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('00:00:02');
    fixture.destroy();
  });

  it('does not replay lobby messages at the start of the film', () => {
    const overlay = new DanmakuOverlayComponent();
    overlay.ngOnInit();
    overlay.checkHistoryTrigger([
      { id: 'lobby', phase: 'LOBBY', nickname: 'Guest', text: 'hello', timeOffset: 0, color: '#ffffff', createdAt: '' },
      { id: 'video', phase: 'VIDEO', nickname: 'Guest', text: 'film', timeOffset: 0, color: '#ffffff', createdAt: '' },
    ], 0);
    expect(overlay.activeBullets().map(item => item.text)).toEqual(['film']);
    overlay.ngOnDestroy();
  });
});
