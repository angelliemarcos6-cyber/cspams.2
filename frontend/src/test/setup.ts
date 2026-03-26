import { afterEach, beforeAll, vi } from "vitest";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  Object.defineProperty(window, "prompt", {
    writable: true,
    value: vi.fn(),
  });

  Object.defineProperty(window, "confirm", {
    writable: true,
    value: vi.fn(() => true),
  });

  class ResizeObserverMock {
    observe() {}

    unobserve() {}

    disconnect() {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    writable: true,
    value: ResizeObserverMock,
  });

  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    writable: true,
    value: vi.fn(),
  });

  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    writable: true,
    value: vi.fn(),
  });

  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.clearAllMocks();
  document.cookie = "XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});
