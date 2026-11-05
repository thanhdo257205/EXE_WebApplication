import { AfterViewInit, Component, ElementRef, Input, NgZone, OnDestroy, ViewChild, inject, signal } from '@angular/core';

/** A live countdown video: rendered locally against the room's server clock.
 * No downloaded clip can run out, loop the wrong number or reveal the main film.
 */
@Component({
  selector: 'app-premiere-countdown',
  standalone: true,
  template: `
    <canvas #canvas width="1280" height="720" hidden></canvas>
    <video #video autoplay muted playsinline aria-hidden="true" class="countdown-video" [class.ready]="streamReady()"></video>
    @if (!streamReady()) {
      <div class="fallback" aria-hidden="true"><span class="ring"></span><strong>{{ displayTime() }}</strong></div>
    }
    <span class="sr-only" role="timer">Công chiếu sau {{ displayTime() }}</span>
  `,
  styles: [`
    :host { display: block; position: absolute; inset: 0; overflow: hidden; background: #080e1d; }
    .countdown-video { width: 100%; height: 100%; object-fit: contain; opacity: 0; }
    .countdown-video.ready { opacity: 1; }
    .fallback { position: absolute; inset: 0; display: grid; place-items: center; background: radial-gradient(ellipse, #18304b, #080e1d 70%); }
    strong { font: 700 clamp(32px, 7vw, 96px) monospace; color: #e4faff; z-index: 1; font-variant-numeric: tabular-nums; }
    .ring { position: absolute; width: 38%; aspect-ratio: 1; border: 2px solid #3bd7e7; border-radius: 50%; box-shadow: 0 0 60px #3bd7e733; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  `],
})
export class PremiereCountdownComponent implements AfterViewInit, OnDestroy {
  @Input() seconds = 0;
  @ViewChild('canvas') private canvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('video') private video!: ElementRef<HTMLVideoElement>;
  readonly streamReady = signal(false);
  private readonly zone = inject(NgZone);
  private timer?: ReturnType<typeof setInterval>;
  private stream?: MediaStream;
  private destroyed = false;

  displayTime() {
    const seconds = Math.max(0, Math.ceil(this.seconds));
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
      .map(part => part.toString().padStart(2, '0')).join(':');
  }

  ngAfterViewInit() {
    const canvas = this.canvas.nativeElement;
    // The HTML timer remains usable on browsers without canvas video capture.
    if (typeof canvas.captureStream !== 'function') return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const draw = () => {
      const phase = (Date.now() % 6000) / 6000;
      const gradient = context.createRadialGradient(640, 360, 20, 640, 360, 730);
      gradient.addColorStop(0, '#18304b'); gradient.addColorStop(1, '#080e1d');
      context.fillStyle = gradient; context.fillRect(0, 0, 1280, 720);
      context.strokeStyle = '#21465e'; context.lineWidth = 2;
      context.beginPath(); context.arc(640, 360, 220, 0, Math.PI * 2); context.stroke();
      context.strokeStyle = '#53e2ec'; context.lineWidth = 5;
      context.beginPath(); context.arc(640, 360, 220, phase * Math.PI * 2, (phase + 0.75) * Math.PI * 2); context.stroke();
      context.fillStyle = '#e4faff'; context.font = 'bold 84px monospace';
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(this.displayTime(), 640, 360);
    };
    try {
      draw();
      this.stream = canvas.captureStream(10);
      const video = this.video.nativeElement;
      video.muted = true;
      video.srcObject = this.stream;
      void video.play().then(() => {
        if (!this.destroyed) this.streamReady.set(true);
      }).catch(() => this.stop());
      this.zone.runOutsideAngular(() => { this.timer = setInterval(draw, 100); });
    } catch { this.stop(); }
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.stream?.getTracks().forEach(track => track.stop());
    this.video.nativeElement.srcObject = null;
    this.streamReady.set(false);
  }

  ngOnDestroy() { this.destroyed = true; this.stop(); }
}
