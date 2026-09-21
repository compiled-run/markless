import { describe, expect, it } from 'vitest';
import { accordionTricks, landedTrick } from './tricks.ts';

describe('accordion trick run', () => {
 it('requires the shortcut and the resulting focus, not just the destination', () => {
  const jump = accordionTricks[2];
  expect(landedTrick(jump, 'ArrowDown', '2', '')).toBe(false);
  expect(landedTrick(jump, 'End', '1', '')).toBe(false);
  expect(landedTrick(jump, 'End', '2', '')).toBe(true);
 });
 it('awards opening and closing only after the accordion changes', () => {
  const open = accordionTricks[3];
  const close = accordionTricks[4];
  expect(landedTrick(open, 'Enter', '2', '')).toBe(false);
  expect(landedTrick(open, 'Enter', '2', 'keyboard')).toBe(true);
  expect(landedTrick(open, ' ', '2', 'keyboard')).toBe(true);
  expect(landedTrick(open, 'Enter', '1', 'styling')).toBe(false);
  expect(landedTrick(close, ' ', '2', 'keyboard')).toBe(false);
  expect(landedTrick(close, ' ', '2', '')).toBe(true);
 });
 it('offers platform-specific hints for compact Mac combinations', () => {
  expect(accordionTricks[2].mac).toContain('Fn');
  expect(accordionTricks[2].windows).toBe('End');
  expect(accordionTricks[5].linux).toBe('Home');
 });
});
