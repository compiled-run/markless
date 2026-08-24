import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Alert from './scenarios/alert.tsrx';
import Basic from './scenarios/basic.tsrx';
import Described from './scenarios/described.tsrx';
import Nested from './scenarios/nested.tsrx';

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
	expectConveys(await readUntil(sr, { role: 'button', name: 'Edit address' }), {
		role: 'button',
		name: 'Edit address',
	});
});

// Why the backdrop uses `hidden` rather than a wrapper's display:none: a reader must not be able to walk into a closed dialog.
test('the content of a closed dialog is not reachable', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Edit address' });
	expect(await walk(6)).not.toContain('Edit delivery address');
});

test('opening the dialog makes its name reachable', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Edit address' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'Edit delivery address' });
});

test('the opened surface announces as a dialog', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Edit address' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { role: 'dialog' });
});

// `alertdialog` has no vocabulary slot, so this reads the reader's own word out of the phrase.
test('an alert announces as an alertdialog', async () => {
	await open(Alert);
	await readUntil(sr, { role: 'button', name: 'Delete account' });
	await sr.press(sr.keys.enter);
	await settle();
	const spoken = await walk(8);
	expect(spoken).toContain('alertdialog');
});

test('a described dialog makes its description reachable', async () => {
	await open(Described);
	await readUntil(sr, { role: 'button', name: 'Delete project' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'Everything in it goes with it and nobody can put it back.' });
});

// The page behind is inert and aria-hidden while the dialog shows, so the reading cursor has nothing outside to land on.
test('reading forward from inside the dialog does not reach the page behind', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Edit address' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'Edit delivery address' });
	expect(await walk(10)).not.toContain('Background');
});

test('opening a second dialog puts the first one out of reach', async () => {
	await open(Nested);
	await readUntil(sr, { role: 'button', name: 'Add delivery address' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { role: 'button', name: 'Verify address' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'Address added' });
	expect(await walk(10)).not.toContain('Background');
});
