import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';

// Rows assert the facts an announcement must convey, never a reader product's
// wording. `sr` is the only line that picks a reader, so the same expectations
// run against NVDA and VoiceOver once those drivers land.
//
// aria-at has no test plan for a toast stack, so these rows follow the ARIA
// specification's live-region rules and the APG's status guidance instead.
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

// The region has to be in the page BEFORE anything is said. A live region added
// at the same moment as its text is not announced by any reader, which is the
// single most common way a toast is silently missed.
test('the region is on the page before the first message', async () => {
	const container = await open(Basic);
	expect(region(container).getAttribute('aria-live')).toBe('polite');
	expect(region(container).querySelectorAll('[ui-toast]')).toHaveLength(0);
});

// Polite, not assertive: a message that is not an emergency waits for the reader
// to finish what it is saying rather than cutting a person off mid-sentence.
test('the region asks to be read politely', async () => {
	const container = await open(Basic);
	expect(region(container).getAttribute('aria-live')).toBe('polite');
	expect(region(container).getAttribute('aria-atomic')).toBe('false');
	// Additions only: a message leaving is not something to announce.
	expect(region(container).getAttribute('aria-relevant')).toBe('additions');
});

// ---------------------------------------------------------------------------
// The three rows below are pinned on the wall the ui lane's header describes in
// full: a component inside a repeat renders nothing on the client. `toaster.root`
// renders no default rows for a bare root, so every row is written out of the family's parts inside a
// `@for` - exactly the shape that wall blocks.
//
// These are pinned rather than deleted because what they assert is still the
// contract a reader depends on, and each one goes green the moment a component
// renders inside a repeat. Nothing about the ANNOUNCEMENT rules changed; only the
// markup that carries them stopped reaching the page.
//
// The two rows above stay green: a live region has to be on the page before its
// first message, and that is a fact about the region itself, not about any row.
// ---------------------------------------------------------------------------

// The words a reader speaks are the message's own. The tone mark beside them is
// decoration - a reader that spoke "×" before "Upload failed" would be reading
// punctuation at a person.
test.fails('the tone mark is not part of what is read', async () => {
	const container = await open(Basic);
	const say = container.querySelector('[data-testid="sticky"]') as HTMLButtonElement;
	say.click();
	await expect
		.poll(() => container.querySelector('[ui-toasttitle]')?.textContent)
		.toBe('Upload failed');
	expect(container.querySelector('[ui-toasticon]')?.getAttribute('aria-hidden')).toBe('true');
});

// One message, said once: a row that renders twice is announced twice, and the
// queue's own update-in-place rule is what keeps that from happening.
test.fails('a message said twice under one id is one thing to read', async () => {
	const container = await open(Basic);
	const save = container.querySelector('[data-testid="save"]') as HTMLButtonElement;
	save.click();
	await expect.poll(() => container.querySelectorAll('[ui-toast]')).toHaveLength(1);
	save.click();
	await expect.poll(() => container.querySelectorAll('[ui-toast]')).toHaveLength(1);
});

// The dismiss button carries a name of its own. Its visible character is "×",
// which a reader would otherwise announce as "times" or skip entirely.
test.fails('the dismiss button is named', async () => {
	const container = await open(Basic);
	const say = container.querySelector('[data-testid="sticky"]') as HTMLButtonElement;
	say.click();
	await expect.poll(() => container.querySelector('[ui-toastclose]')).toBeTruthy();
	expect(container.querySelector('[ui-toastclose]')?.getAttribute('aria-label')).toBe('Dismiss');
});
