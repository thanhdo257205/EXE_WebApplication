import { Directive, HostListener, OnDestroy, output } from '@angular/core';

/**
 * Enter-to-submit that works with Vietnamese input methods (Telex/VNI in Unikey, EVKey, OS IMEs).
 *
 * While an IME is composing the last word, Enter is consumed to commit it: the keydown arrives with
 * `isComposing` / keyCode 229 / key "Process", so a plain `(keydown.enter)` never fires and the user had
 * to press Space first. Here an Enter during composition is remembered and `imeEnter` fires right
 * after the composition ends (once the committed text has reached the model), so one Enter is enough.
 * Shift+Enter is left alone. Use with `COMPOSITION_BUFFER_MODE = false` so ngModel also sees the
 * text being composed (buttons bound to it are not stuck disabled).
 */
@Directive({ selector: '[appImeEnter]', standalone: true })
export class ImeEnterDirective implements OnDestroy {
  readonly imeEnter = output<void>();
  private pending = false;
  private timer?: ReturnType<typeof setTimeout>;

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    const isEnter = event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter';
    if (!isEnter || event.shiftKey) return;
    if (event.isComposing || event.keyCode === 229) {
      // The IME commits the word with this Enter; submit once that is done.
      this.pending = true;
      return;
    }
    event.preventDefault(); // also stops a duplicate implicit form submit
    this.fire();
  }

  @HostListener('compositionend')
  onCompositionEnd() {
    if (!this.pending) return;
    this.pending = false;
    // Some browsers deliver the final `input` event after compositionend: wait one task for the model.
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fire(), 0);
  }

  @HostListener('blur')
  onBlur() {
    this.pending = false;
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
  }

  private fire() {
    this.imeEnter.emit();
  }
}
