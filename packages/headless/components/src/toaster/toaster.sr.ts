import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';

// Rows assert the facts an announcement must convey, never a reader product's wording.
const sr = virtualDriver;

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
	return container as unknown as HTMLElement;
}

afterEach(async () => {
	await sr.stop().catch(() => {});
});

function region(container: HTMLElement) {
	const found = container.querySelector('[data-testid="root"]');
	if (!found) throw new Error('Expected the region to be on the page.');
	return found;
}

// A live region added at the same moment as its text is announced by no reader.
test('the region is on the page before the first message', async () => {
	const container = await open(Basic);
	expect(region(container).getAttribute('aria-live')).toBe('polite');
	expect(region(container).querySelectorAll('[ui-toast]')).toHaveLength(0);
});

// Polite, not assertive: a message that is not an emergency must not cut a person off mid-sentence.
test('the region asks to be read politely', async () => {
	const container = await open(Basic);
	expect(region(container).getAttribute('aria-live')).toBe('polite');
	expect(region(container).getAttribute('aria-atomic')).toBe('false');
	// Additions only: a message leaving is not something to announce.
	expect(region(container).getAttribute('aria-relevant')).toBe('additions');
});

// The tone mark is decoration - a reader that spoke it before the message would be reading punctuation at a person.
test('the tone mark is not part of what is read', async () => {
	const container = await open(Basic);
	const say = container.querySelector('[data-testid="sticky"]') as HTMLButtonElement;
	say.click();
	await expect
		.poll(() => container.querySelector('[ui-toasttitle]')?.textContent)
		.toBe('Upload failed');
	expect(container.querySelector('[ui-toasticon]')?.getAttribute('aria-hidden')).toBe('true');
});

// A row that renders twice is announced twice; the queue's update-in-place rule is what prevents it.
test('a message said twice under one id is one thing to read', async () => {
	const container = await open(Basic);
	const save = container.querySelector('[data-testid="save"]') as HTMLButtonElement;
	save.click();
	await expect.poll(() => container.querySelectorAll('[ui-toast]')).toHaveLength(1);
	save.click();
	await expect.poll(() => container.querySelectorAll('[ui-toast]')).toHaveLength(1);
});

// The visible character is "×", which a reader would otherwise announce as "times" or skip entirely.
test('the dismiss button is named', async () => {
	const container = await open(Basic);
	const say = container.querySelector('[data-testid="sticky"]') as HTMLButtonElement;
	say.click();
	await expect.poll(() => container.querySelector('[ui-toastclose]')).toBeTruthy();
	expect(container.querySelector('[ui-toastclose]')?.getAttribute('aria-label')).toBe('Dismiss');
});
