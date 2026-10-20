import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LEGAL_DOCUMENTS } from './legal-content';

@Component({
  selector: 'app-legal-page',
  imports: [RouterLink],
  templateUrl: './legal.page.html',
  styleUrl: './legal.page.css',
})
export class LegalPage {
  private readonly routeData = toSignal(inject(ActivatedRoute).data);
  readonly document = computed(() => LEGAL_DOCUMENTS[
    this.routeData()?.['legalDocument'] === 'terms' ? 'terms' : 'privacy'
  ]);
}
