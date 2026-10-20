import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdminDashboardPage } from './admin-dashboard.page';
import { AdminContentService, AdminDashboardData } from '../../../core/admin/admin-content.service';
import { AuthService } from '../../../core/auth/auth.service';

describe('AdminDashboardPage', () => {
  let component: AdminDashboardPage;
  let fixture: ComponentFixture<AdminDashboardPage>;
  let adminApiSpy: any;

  const mockDashboard: AdminDashboardData = {
    asOf: '2026-10-20T12:00:00Z',
    releases: { draft: 2, published: 1, archived: 0 },
    feedbackNew: 4,
    cardsNeedingReview: 7,
  };

  beforeEach(async () => {
    adminApiSpy = {
      getDashboard: () => of(mockDashboard),
    };

    await TestBed.configureTestingModule({
      imports: [AdminDashboardPage],
      providers: [
        provideRouter([]),
        { provide: AdminContentService, useValue: adminApiSpy },
        {
          provide: AuthService,
          useValue: {
            currentUser: { set: () => {}, id: 'admin-1', role: 'ADMIN' },
            getCsrf: () => of({ headerName: 'X-XSRF-TOKEN', token: 'test' }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the admin dashboard component', () => {
    expect(component).toBeTruthy();
  });

  it('loads real dashboard metrics from backend API', () => {
    expect(component.backendStatus()).toBe('CONNECTED');
    expect(component.dashboardData()).toEqual(mockDashboard);
    expect(component.dashboardData()?.cardsNeedingReview).toBe(7);
  });

  it('filters queue items by category', () => {
    expect(component.filteredItems.length).toBe(5);
    component.setFilter('PAYMENT');
    expect(component.filteredItems.length).toBe(1);
    expect(component.filteredItems[0].category).toBe('PAYMENT');
  });

  it('triggers refresh animation state and reloads data', () => {
    expect(component.refreshing()).toBe(false);
    component.refreshDashboard();
    expect(component.backendStatus()).toBe('CONNECTED');
  });

  it('handles offline or error state gracefully', () => {
    adminApiSpy.getDashboard = () => throwError(() => ({ detail: 'Backend sleeping' }));
    component.loadDashboardData();
    expect(component.backendStatus()).toBe('OFFLINE');
    expect(component.errorMessage()).toBe('Backend sleeping');
  });
});
