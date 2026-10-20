import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MorphIconComponent } from './morph-icon.component';

describe('MorphIconComponent', () => {
  let component: MorphIconComponent;
  let fixture: ComponentFixture<MorphIconComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MorphIconComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MorphIconComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('name', 'home');
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should resolve icon path correctly', () => {
    const d = component.resolveIcon('home');
    expect(d).toContain('M3');
  });
});
