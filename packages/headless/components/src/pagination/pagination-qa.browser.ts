import { render } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import DisabledWithOnChange from './scenarios/disabled-with-onchange.tsrx';

function at<T extends Element = HTMLElement>(testid: string): T {
	const found = page.getByTestId(testid).element();
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found as unknown as T;
}

async function settled() {
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// The button controls go inert natively; the link does not. An anchor has no
// `disabled` attribute, so it stays focusable and clickable and the family's own
// refusal is the only thing between a press and the consumer's callback.

test('CSR: a link on a pagination nobody may move never reaches the consumer', async () => {
	await render(DisabledWithOnChange);

	expect(at('itemlink-2').getAttribute('aria-disabled')).toBe('true');
	expect(at('itemlink-2').hasAttribute('disabled')).toBe(false);

	const before = window.location.href;
	at('itemlink-2').click();
	await settled();
	expect(at('calls').textContent).toBe('0');
	// An unavailable link keeps its href for crawlers and still goes nowhere when pressed.
	expect(window.location.href).toBe(before);
	// The page never moved, so the current mark is still where it was served.
	expect(at('itemlink-3').getAttribute('aria-current')).toBe('page');
	expect(at('itemlink-2').hasAttribute('aria-current')).toBe(false);
});

test('CSR: the step controls on a pagination nobody may move never reach the consumer', async () => {
	await render(DisabledWithOnChange);

	expect(at<HTMLButtonElement>('backtrigger').disabled).toBe(true);
	expect(at<HTMLButtonElement>('forwardtrigger').disabled).toBe(true);

	at('backtrigger').click();
	at('forwardtrigger').click();
	at('itemtrigger-4').click();
	await settled();

	expect(at('calls').textContent).toBe('0');
	expect(at('itemlink-3').getAttribute('aria-current')).toBe('page');
});

test('CSR: pressing the same link twice on a locked pagination still reports nothing', async () => {
	await render(DisabledWithOnChange);

	// Repeated activation is where a guard that only compares against the current
	// page would let the second press through.
	at('itemlink-2').click();
	at('itemlink-2').click();
	at('itemlink-3').click();
	await settled();

	expect(at('calls').textContent).toBe('0');
	expect(at('last').textContent).toBe('0');
	expect(at('itemlink-3').getAttribute('aria-current')).toBe('page');
});
