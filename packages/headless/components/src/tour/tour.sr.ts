import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import ServedOpen from './scenarios/served-open.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

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

// The card reaches the DOM after the dispatch the press woke returns, so the
// reader is asked again until the new state is what it reads.
async function startTour() {
	const start = document.querySelector('[data-testid="start"]') as HTMLElement;
	start.focus();
	await sr.settleOnFocus();
	start.click();
	await expect
		.poll(() => document.querySelector('[data-testid="step-save"]')?.hasAttribute('hidden'))
		.toBe(false);
	await new Promise((resolve) => setTimeout(resolve, 20));
	return start;
}

afterEach(async () => {
	await sr.stop().catch(() => {});
	// The overlay stack is page-wide, so a row that leaves a card enlisted leaves the next row's page inert.
	for (let unwind = 0; unwind < 6; unwind++) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	for (const marked of Array.from(document.body.children)) {
		marked.removeAttribute('inert');
		marked.removeAttribute('aria-hidden');
	}
});

test('the step card announces as a dialog named by its title', async () => {
	await open(Basic);
	await startTour();
	expectConveys(await readUntil(sr, { role: 'dialog', name: 'Save your work' }), {
		role: 'dialog',
		name: 'Save your work',
	});
});

test('the card also conveys the description that says which element the step means', async () => {
	await open(Basic);
	await startTour();
	expectConveys(await readUntil(sr, { role: 'dialog', name: 'Save your work' }), {
		name: 'The Save button in the toolbar keeps a copy of the document.',
	});
});

// The place in the tour is text inside the card rather than a value on the card:
// `role="dialog"` takes no `aria-valuetext`, so the count is spoken by being read.
test('the card conveys how far along the tour is, as "n of m"', async () => {
	await open(Basic);
	await startTour();
	await readUntil(sr, { role: 'dialog', name: 'Save your work' });
	expect(await walk(8)).toContain('1 of 3');
});

test('a tour served open announces its first card without any press', async () => {
	await open(ServedOpen);
	expectConveys(await readUntil(sr, { role: 'dialog', name: 'Save your work' }), {
		role: 'dialog',
		name: 'Save your work',
	});
});

// The spotlight is a dimmed hole with no words in it, so the description carries
// the meaning and the backdrop must not be walked into as an object of its own.
test('the backdrop is not something a reader walks into', async () => {
	await open(Basic);
	await startTour();
	await readUntil(sr, { role: 'dialog', name: 'Save your work' });
	expect(await walk(8)).not.toContain('backdrop');
});

test('a step nobody has reached yet is out of reach', async () => {
	await open(Basic);
	await startTour();
	await readUntil(sr, { role: 'dialog', name: 'Save your work' });
	expect(await walk(8)).not.toContain('Delete it');
});

test('the triggers inside the card are reachable and named', async () => {
	await open(Basic);
	await startTour();
	await readUntil(sr, { role: 'dialog', name: 'Save your work' });
	expectConveys(await readUntil(sr, { role: 'button', name: 'Next' }), {
		role: 'button',
		name: 'Next',
	});
});

test('Escape closes the tour and puts the card out of reach', async () => {
	await open(Basic);
	await startTour();
	await readUntil(sr, { role: 'dialog', name: 'Save your work' });

	await sr.press('Escape');
	await expect
		.poll(() => document.querySelector('[data-testid="step-save"]')?.hasAttribute('hidden'))
		.toBe(true);
	expect(await walk(8)).not.toContain('Save your work');
});

// Focus goes back to what opened the tour, so the reader follows it there and
// says where it landed by itself.
test('closing hands focus back to the control that started the tour', async () => {
	await open(Basic);
	const start = await startTour();
	await readUntil(sr, { role: 'dialog', name: 'Save your work' });

	await sr.press('Escape');
	await expect
		.poll(() => document.querySelector('[data-testid="step-save"]')?.hasAttribute('hidden'))
		.toBe(true);
	expect(document.activeElement).toBe(start);
});
