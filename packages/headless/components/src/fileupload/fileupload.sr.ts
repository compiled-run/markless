import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { dropOn, fileOf } from '../../test-support/drag.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';

// Rows assert the facts an announcement must convey, never a reader product's wording.
//
// What a reader lane cannot witness here: a real drag, and the operating system's
// own file picker. Both happen outside the document, so the rows below stop at the
// browse button's name and role, the field's absence from the reader tree, the
// drop area's inertness, and a row's name once a file has arrived.
const sr = virtualDriver;

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
	return container as unknown as HTMLElement;
}

afterEach(async () => {
	await sr.stop().catch(() => {});
});

function find(container: HTMLElement, testid: string) {
	const found = container.querySelector(`[data-testid="${testid}"]`);
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found;
}

// The browse button is the whole keyboard and reader route into this family, so
// it is the one control that has to be reachable and named.
test('the browse button is a named button', async () => {
	const container = await open(Basic);
	const trigger = find(container, 'trigger');
	expect(trigger.localName).toBe('button');
	expect(trigger.getAttribute('type')).toBe('button');
	expect(trigger.textContent).toBe('Browse');
});

// The real input is the thing that submits, not the thing a person operates: it is
// clipped, hidden from the reader, and out of the tab order, so the button is the
// only way in and there is no second stop that does the same job.
test('the real file input is not something a reader walks onto', async () => {
	const container = await open(Basic);
	const field = find(container, 'field');
	expect(field.getAttribute('aria-hidden')).toBe('true');
	expect(field.getAttribute('tabindex')).toBe('-1');
});

// Dropping is a pointer enhancement. A role and a tab stop here would announce a
// second control that does exactly what the browse button already does.
test('the drop area announces nothing of its own', async () => {
	const container = await open(Basic);
	const droparea = find(container, 'droparea');
	expect(droparea.hasAttribute('role')).toBe(false);
	expect(droparea.hasAttribute('tabindex')).toBe(false);
	expect(droparea.hasAttribute('aria-label')).toBe(false);
});

// The label is what gives the field a name; without the `for` the input is an
// unnamed form control.
test('the upload is named', async () => {
	const container = await open(Basic);
	const field = find(container, 'field');
	expect(find(container, 'label').getAttribute('for')).toBe(field.id);
	expect(field.id).not.toBe('');
});

test('a file that arrives is a row a reader can read by name', async () => {
	const container = await open(Basic);
	dropOn(find(container, 'droparea'), fileOf('notes.txt'));
	await expect
		.poll(() => container.querySelector('[data-testid="itemlabel"]')?.textContent)
		.toBe('notes.txt');
});

// The visible character is "×", which a reader would otherwise announce as "times"
// or skip entirely; the consumer supplies the words.
test('the remove button on a row is named', async () => {
	const container = await open(Basic);
	dropOn(find(container, 'droparea'), fileOf('notes.txt'));
	await expect.poll(() => container.querySelector('[data-testid="itemclose"]')).toBeTruthy();
	expect(container.querySelector('[data-testid="itemclose"]')?.getAttribute('aria-label')).toBe(
		'Remove',
	);
});
