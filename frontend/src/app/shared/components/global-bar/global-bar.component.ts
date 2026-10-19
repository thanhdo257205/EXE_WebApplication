import { Component, output } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-global-bar',
  imports: [RouterLink],
  templateUrl: './global-bar.component.html',
  styleUrl: './global-bar.component.css',
})
export class GlobalBarComponent {
  readonly menuToggle = output<void>();
}
