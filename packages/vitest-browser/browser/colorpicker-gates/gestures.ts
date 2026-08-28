import { page } from 'vite-plus/test/browser';
import { expect } from 'vitest';

export function fieldAt(testid: string): HTMLInputElement {
	return page.getByTestId(testid).element() as HTMLInputElement;
}

export function cellTextAt(testid: string): string {
	return String(page.getByTestId(testid).element().textContent ?? '');
}

/** The property, not the attribute: only the property is what a person sees. */
export async function expectDisplayed(testid: string, text: string): Promise<void> {
	await expect.poll(() => fieldAt(testid).value).toBe(text);
}

export async function expectCell(testid: string, text: string): Promise<void> {
	await expect.poll(() => cellTextAt(testid)).toBe(text);
}

/**
 * A press-move-release over the area, the colorpicker drag shape. Synthetic
 * pointer events rather than a real cursor walk: the write under test is the
 * handler's, and a real walk would also cross the fields above it.
 */
export function dragAcross(testid: string): void {
	const area = page.getByTestId(testid).element();
	area.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	area.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
	area.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
}
