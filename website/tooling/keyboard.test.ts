import { expect, it } from 'vitest';
import { expandKeyboardStyles } from './keyboard.ts';
it('connects inspected physical keys to matching actions for each platform', () => {
 const css=expandKeyboardStyles('@keyboard-highlights; @keyboard-platforms; @keyboard-inspection;');
 expect(css).toContain('[data-inspected="ArrowLeft"][data-inspection-platform="mac"] .keyboard-action[data-mac-keys~="ArrowLeft"]');
 expect(css).toContain('[data-inspected="Home"][data-inspection-platform="windows"] .keyboard-action[data-windows-keys~="Home"]');
 expect(css).not.toContain('@keyboard-inspection;');
});
