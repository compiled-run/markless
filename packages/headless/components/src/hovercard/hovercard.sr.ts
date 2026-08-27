import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Rich from './scenarios/rich.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

const TRIGGER = '@jane';
const CARD_NAME = 'Jane Doe';
const CARD_FOLLOWERS = '312 followers';

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

// The trigger is a link, not a button, and it says a surface is there and shut.
// Without the collapsed state a reader is told nothing at all about the card,
// which is what makes the "sighted users only" hover card unusable rather than
// merely limited.
test('reaching the trigger conveys a link, its own name, and a collapsed surface', async () => {
	await open(Rich);
	expect(content().hasAttribute('hidden')).toBe(true);

	const phrase = await readUntil(sr, { role: 'link', name: TRIGGER });
	expectConveys(phrase, { role: 'link', name: TRIGGER, state: ['notExpanded'] });
});

// The only signal a reader gets that anything happened. The card's arrival in the
// DOM is not announced and must not be - it is no live region - so the state on
// the trigger is carrying the whole message.
test('showing the card flips the trigger to expanded', async () => {
	await open(Rich);
	await readUntil(sr, { role: 'link', name: TRIGGER });

	trigger().focus();
	await expect.poll(() => content().hasAttribute('hidden')).toBe(false);

	const phrase = await readUntil(sr, { role: 'link', name: TRIGGER, state: ['expanded'] });
	expectConveys(phrase, { role: 'link', name: TRIGGER, state: ['expanded'] });
});

// The whole reason this family refuses `aria-describedby`: a description is
// flattened to one string, so the card's links would arrive welded together and
// unreachable. Walked open, they are separate stops with their own roles.
test('the open card is walked as distinct facts rather than one flattened string', async () => {
	await open(Rich);
	await readUntil(sr, { role: 'link', name: TRIGGER });
	trigger().focus();
	await expect.poll(() => content().hasAttribute('hidden')).toBe(false);

	const name = await readUntil(sr, { role: 'link', name: CARD_NAME });
	expectConveys(name, { role: 'link', name: CARD_NAME });
	expect(name).not.toContain(CARD_FOLLOWERS);

	const followers = await readUntil(sr, { role: 'link', name: CARD_FOLLOWERS });
	expectConveys(followers, { role: 'link', name: CARD_FOLLOWERS });

	const follow = await readUntil(sr, { role: 'button', name: 'Follow' });
	expectConveys(follow, { role: 'button', name: 'Follow' });
});

// Higley's avoid list. A hover card is not a live region, and the row goes red
// the day someone reaches for one.
test('showing the card announces nothing on its own', async () => {
	await open(Rich);
	await readUntil(sr, { role: 'link', name: TRIGGER });
	const before = await sr.lastSpokenPhrase();

	trigger().focus();
	await expect.poll(() => content().hasAttribute('hidden')).toBe(false);
	await new Promise((resolve) => setTimeout(resolve, 100));

	expect(await sr.lastSpokenPhrase()).toBe(before);
});

// Closed, the card is out of the tree a reader moves through entirely - `hidden`
// takes the whole subtree, which is also what keeps its links out of the tab
// order.
test('the hidden card is not a stop on the walk', async () => {
	await open(Rich);
	await readUntil(sr, { role: 'link', name: TRIGGER });

	expect(await walk(4)).not.toContain(CARD_NAME);
});
