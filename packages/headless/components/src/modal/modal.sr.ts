import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Alert from './scenarios/alert.tsrx';
import Basic from './scenarios/basic.tsrx';
import Described from './scenarios/described.tsrx';
import Nested from './scenarios/nested.tsrx';

// Rows follow the w3c/aria-at modal-dialog plan (Sequences A-F) and assert the
// facts an announcement must convey, never a reader product's wording. `sr` is
// the only line that picks a reader, so the same expectations run against NVDA
// and VoiceOver once those drivers land.
const sr = virtualDriver;

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

function expectConveys(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

// Nothing changed is not something a poll can wait for: give the dispatch the
// same room a real activation gets, then read the item once.
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
	// The overlay behaviour keeps one page-wide stack, so a row that leaves a
	// surface enlisted leaves the next row's page inert. Drain, then reset.
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

// The other half of a closed dialog: the surface is hidden, so nothing in it is
// reachable. A reader that can walk into hidden content is the failure this row
// catches, and it is why `hidden` on the backdrop rather than a wrapper's
// `display:none` matters.
test('the content of a closed dialog is not reachable', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Edit address' });
	expect(await walk(6)).not.toContain('Edit delivery address');
});

// aria-at Sequence A: the dialog's name is announced when it opens.
test('opening the dialog makes its name reachable', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Edit address' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'Edit delivery address' });
});

// aria-at's modal-dialog plan asserts the dialog role at priority 1. The shared
test('the opened surface announces as a dialog', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Edit address' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { role: 'dialog' });
});

// The alert delta: same anatomy, different announced role. `alertdialog` is not
// a slot in the shared vocabulary, so this row reads the reader's own word out
// of the phrase rather than through `Conveys.role`.
test('an alert announces as an alertdialog', async () => {
	await open(Alert);
	await readUntil(sr, { role: 'button', name: 'Delete account' });
	await sr.press(sr.keys.enter);
	await settle();
	const spoken = await walk(8);
	expect(spoken).toContain('alertdialog');
});

// aria-at Sequence E, step 3: the description sentence is announced verbatim.
test('a described dialog makes its description reachable', async () => {
	await open(Described);
	await readUntil(sr, { role: 'button', name: 'Delete project' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'Everything in it goes with it and nobody can put it back.' });
});

// aria-at Sequence C, and the assertion this family exists for: reading forward
// from inside the dialog does not leave it. The page behind is marked inert and
// aria-hidden while the dialog is showing, so the reading cursor has nothing
// outside to land on.
test('reading forward from inside the dialog does not reach the page behind', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Edit address' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { name: 'Edit delivery address' });
	expect(await walk(10)).not.toContain('Background');
});

// aria-at Sequence E, step 5: the cursor is inside the second dialog, and the
// first one is unreachable too.
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
