import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { RevealDirective } from '../../motion/reveal.directive';
import { exploreLinksExcept } from '../../explore-links';

/** Lưới thẻ "ghé phòng khác": dẫn tới các khu vực đã hoạt động, bỏ khu vực đang đứng. */
@Component({
  selector: 'app-explore-cards',
  imports: [RouterLink, RevealDirective],
  template: `<ul class="cards">
    @for (item of items(); track item.link; let i = $index) {
      <li [appReveal]="i * 90"><a class="kit-card" [routerLink]="item.link"><span class="kit-meta"><span>0{{ i + 1 }}</span><span>{{ item.meta }}</span></span><h3>{{ item.title }}</h3><p>{{ item.text }}</p><span class="kit-foot">{{ item.cta }} <span aria-hidden="true">↗</span></span></a></li>
    }
  </ul>`,
  styles: `:host{display:block}.cards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:16px}`,
})
export class ExploreCardsComponent {
  private readonly router = inject(Router);
  readonly count = input(3);
  readonly items = computed(() => exploreLinksExcept(this.router.url, this.count()));
}
