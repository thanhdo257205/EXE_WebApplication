import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { AdminSectionPage } from './admin-section.page';

describe('AdminSectionPage', () => {
  let component: AdminSectionPage;
  let fixture: ComponentFixture<AdminSectionPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminSectionPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { section: 'cards' },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminSectionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create admin section page', () => {
    expect(component).toBeTruthy();
  });

  it('should compute cards meta correctly', () => {
    const meta = component.meta();
    expect(meta.key).toBe('cards');
    expect(meta.badge).toBe('148 THẺ BÀI');
  });
});
