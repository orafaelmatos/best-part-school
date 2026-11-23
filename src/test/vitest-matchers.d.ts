import '@testing-library/jest-dom';
import type matchers from '@testing-library/jest-dom/matchers';
import 'vitest';

// Vitest 5 augments Matchers<R, T>; jest-dom 6 still augments the old Assertion interface.
type DOMMatchers<R, T> = Pick<jest.Matchers<R, T>, keyof typeof matchers>;
declare module 'vitest' {
  // Declaration merging is required by the Vitest matcher extension API.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Matchers<R, T> extends DOMMatchers<R, T> {}
}
