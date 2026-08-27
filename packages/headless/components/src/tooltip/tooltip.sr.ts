import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import IconButton from './scenarios/icon-button.tsrx';

// Rows assert the facts an announcement must convey - role, name, description - never a reader product's wording.
const sr = virtualDriver;

const TIP = 'Save this draft';

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

function expectConveys(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

async function walk(steps: number) {
	const spoken: string[] = [];
	for (let step = 0; step < steps; step++) {
		await sr.next();
		spoken.push(await sr.lastSpokenPhrase());
	}
	return spoken.join(' | ');
}

function trigger() {
	return document.querySelector('[data-testid="trigger"]') as HTMLElement;
}

function content() {
	return document.querySelector('[data-testid="content"]') as HTMLElement;
}

afterEach(async () => {
	await sr.stop().catch(() => {});
	// The overlay stack is page-wide, so a row that leaves a surface enlisted leaves the next row's page inert.
	for (let unwind = 0; unwind < 4; unwind++) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	for (const marked of Array.from(document.body.children)) {
		marked.removeAttribute('inert');
		marked.removeAttribute('aria-hidden');
	}
});

// The family's central claim: the description reaches a reader on Tab with the
// tip never shown. A directly referenced hidden node still contributes its text,
// which is why the reference is permanent rather than switched on when it opens.
test('reaching the trigger conveys its role, its name and the tip, with nothing shown', async () => {
	await open(Basic);
	expect(content().hasAttribute('hidden')).toBe(true);

	const phrase = await readUntil(sr, { role: 'button', name: 'Save' });
	expectConveys(phrase, { role: 'button', name: 'Save' });
	expectConveys(phrase, { name: TIP });
	expect(content().hasAttribute('hidden')).toBe(true);
});

// The icon-only case, and the proof the tip was not collapsed into the name: the
// trigger's own `aria-label` and the tip's text are two separate facts.
test('an icon-only trigger conveys its own name and the tip as separate facts', async () => {
	await open(IconButton);

	const phrase = await readUntil(sr, { role: 'button', name: 'Save' });
	expectConveys(phrase, { role: 'button', name: 'Save' });
	expectConveys(phrase, { name: TIP });
	expect(phrase.indexOf('Save')).not.toBe(phrase.indexOf(TIP));
});

// A tooltip is not a live region: showing it must add nothing to the stream.
// Higley's avoid list, and the row that goes red the day someone reaches for one.
test('showing the tip announces nothing new', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Save' });
	const before = await sr.lastSpokenPhrase();

	trigger().focus();
	await expect.poll(() => content().hasAttribute('hidden')).toBe(false);
	await new Promise((resolve) => setTimeout(resolve, 100));

	expect(await sr.lastSpokenPhrase()).toBe(before);
});

test('hiding the tip with Escape announces nothing', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Save' });
	trigger().focus();
	await expect.poll(() => content().hasAttribute('hidden')).toBe(false);
	const before = await sr.lastSpokenPhrase();

	await sr.press('Escape');
	await expect.poll(() => content().hasAttribute('hidden')).toBe(true);
	expect(await sr.lastSpokenPhrase()).toBe(before);
});

// The tip is the trigger's description, not a place to walk into: hidden takes
// the whole subtree out of the tree a reader moves through.
test('the hidden tip is not a stop on the walk', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Save' });

	expect(await walk(4)).not.toContain('tooltip');
});
