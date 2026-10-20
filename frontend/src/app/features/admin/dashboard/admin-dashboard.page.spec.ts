import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminDashboardPage } from './admin-dashboard.page';

describe('AdminDashboardPage', () => {
  let component: AdminDashboardPage;
  let fixture: ComponentFixture<AdminDashboardPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDashboardPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the admin dashboard component', () => {
    expect(component).toBeTruthy();
  });

  it('filters queue items by category', () => {
    expect(component.filteredItems.length).toBe(5);
    component.setFilter('PAYMENT');
    expect(component.filteredItems.length).toBe(1);
    expect(component.filteredItems[0].category).toBe('PAYMENT');
  });

  it('triggers refresh animation state', () => {
    expect(component.refreshing()).toBe(false);
    component.refreshDashboard();
    expect(component.refreshing()).toBe(true);
  });
});
