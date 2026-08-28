import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import Described from './scenarios/described.tsrx';
import Nested from './scenarios/nested.tsrx';
import NonModal from './scenarios/nonmodal.tsrx';
import Snapped from './scenarios/snapped.tsrx';

// Rows assert the facts an announcement must convey, never a reader product's wording.
const sr = virtualDriver;

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

function expectConveys(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

// Nothing-changed is not something a poll can wait for, so give the dispatch the room a real activation gets.
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 150));
}

async function walk(steps: number) {
	const spoken: string[] = [];
	for (let step = 0; step < steps; step++) {
		await sr.next();
		spoken.push(await sr.lastSpokenPhrase());
	}
	return spoken.join(' | ');
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
	document.body.style.overflow = '';
});

test('reading the starter conveys the trigger button and its name', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Filter results' }), {
		role: 'button',
		name: 'Filter results',
	});
});

// A closed drawer sits behind a hidden backdrop, which takes the whole subtree out of the tree a reader walks.
test('the content of a closed drawer is not reachable', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Filter results' });
	expect(await walk(6)).not.toContain('Narrow these results');
});

test('opening the drawer makes its name reachable', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Filter results' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'Narrow these results' });
});

test('the opened surface announces as a dialog', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Filter results' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { role: 'dialog' });
});

test('a described drawer makes its description reachable', async () => {
	await open(Described);
	await readUntil(sr, { role: 'button', name: 'Review order' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'Swipe down to put this away and nothing is charged.' });
});

// The page behind is inert and aria-hidden while a modal drawer shows, so the reading cursor has nothing outside to land on.
test('reading forward from inside the drawer does not reach the page behind', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Filter results' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'Narrow these results' });
	expect(await walk(10)).not.toContain('Background');
});

// The one attribute that separates the two modes, seen from the reader's side.
test('a non-modal drawer leaves the page behind reachable', async () => {
	await open(NonModal);
	await readUntil(sr, { role: 'button', name: 'Now playing' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'Now playing' });
	expect(await walk(10)).toContain('Background');
});

test('opening a second drawer puts the first one out of reach', async () => {
	await open(Nested);
	await readUntil(sr, { role: 'button', name: 'Payment method' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { role: 'button', name: 'Add a card' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'Card added' });
	expect(await walk(10)).not.toContain('Background');
});

// The rest position is geometry, not a fact a reader has a word for: what a
// keyboard-only person gets from the arrows is the drawer's size changing, and
// nothing in the announcement should change with it.
test('a drawer resting at an intermediate position announces as an ordinary dialog', async () => {
	await open(Snapped);
	await readUntil(sr, { role: 'button', name: 'Nearby stops' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { role: 'dialog' });
	await readUntil(sr, { name: 'Where to next?' });
});
