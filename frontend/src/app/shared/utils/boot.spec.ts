import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOT_EVENT, runBoot } from './boot';

describe('runBoot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.dataset['boot'] = 'pending';
    document.body.innerHTML = '<div id="boot-curtain"></div>';
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

  it('giữ màn mở trang rồi gỡ sau khi trượt lên', () => {
    const booted = vi.fn();
    window.addEventListener(BOOT_EVENT, booted);
    runBoot();
    expect(document.documentElement.dataset['boot']).toBe('pending');
    vi.advanceTimersByTime(2700);
    expect(document.documentElement.dataset['boot']).toBe('done');
    expect(document.getElementById('boot-curtain')).toBeNull();
  });

  it('thêm class leave khi bắt đầu trượt lên', () => {
    runBoot();
    vi.advanceTimersByTime(1200);
    expect(document.getElementById('boot-curtain')?.classList.contains('leave')).toBe(true);
  });

  it('đặt boot=done và phát sự kiện', () => {
    const booted = vi.fn();
    window.addEventListener(BOOT_EVENT, booted);
    runBoot();
    vi.advanceTimersByTime(2700);
    expect(booted).toHaveBeenCalledTimes(1);
    window.removeEventListener(BOOT_EVENT, booted);
  });

  it('reduced motion bỏ màn mở trang ngay', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    runBoot();
    expect(document.documentElement.dataset['boot']).toBe('done');
    expect(document.getElementById('boot-curtain')).toBeNull();
  });
});
