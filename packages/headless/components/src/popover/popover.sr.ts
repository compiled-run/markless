import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import ServedOpen from './scenarios/served-open.tsrx';
import Unnamed from './scenarios/unnamed.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

function expectConveys(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

// The surface reaches the DOM after the dispatch its press woke returns, so the reader is asked again until the new state is what it reads.
async function expectAnnouncesAfterChange(conveys: Conveys) {
	await expect.poll(async () => missingFacts(sr, await sr.reannounce(), conveys)).toEqual([]);
}

async function walk(steps: number) {
	const spoken: string[] = [];
	for (let step = 0; step < steps; step++) {
		await sr.next();
		spoken.push(await sr.lastSpokenPhrase());
	}
	return spoken.join(' | ');
}

async function pressTrigger() {
	const trigger = document.querySelector('[data-testid="trigger"]') as HTMLElement;
	trigger.focus();
	await sr.settleOnFocus();
	await sr.press(sr.keys.enter);
	await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('true');
	return trigger;
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

test('entering the popover conveys the trigger button and its name', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Share' }), {
		role: 'button',
		name: 'Share',
	});
});

test('a popover that is not showing its surface conveys that the trigger is collapsed', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Share' }), {
		role: 'button',
		name: 'Share',
		state: ['notExpanded'],
	});
});

// Why the closed surface uses `hidden` rather than a wrapper's display:none: a reader must not be able to walk into a popover nobody opened.
test('the content of a closed popover is not reachable', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Share' });
	expect(await walk(6)).not.toContain('Share this page');
});

// `aria-haspopup="dialog"` is what tells a reader a surface is coming rather than a page change; no vocabulary slot holds it, so this reads the reader's own word.
test('the trigger conveys that it opens a dialog', async () => {
	await open(Basic);
	expect(await readUntil(sr, { role: 'button', name: 'Share' })).toContain('dialog');
});

test('pressing the trigger conveys it as expanded', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Share' });
	await pressTrigger();
	await expectAnnouncesAfterChange({ role: 'button', name: 'Share', state: ['expanded'] });
});

test('the opened surface announces as a dialog named by its title', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Share' });
	await pressTrigger();
	expectConveys(await readUntil(sr, { role: 'dialog', name: 'Share this page' }), {
		role: 'dialog',
		name: 'Share this page',
	});
});

test('the opened dialog also conveys its description', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Share' });
	await pressTrigger();
	expectConveys(await readUntil(sr, { role: 'dialog', name: 'Share this page' }), {
		name: 'Anyone with the link can read it.',
	});
});

test('the close button inside the opened surface is reachable and named', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Share' });
	await pressTrigger();
	expectConveys(await readUntil(sr, { role: 'button', name: 'Done' }), {
		role: 'button',
		name: 'Done',
	});
});

// The naming references are emitted whether or not anything fills them, so a surface with neither part must still announce as a dialog rather than as an unnamed group.
test('a popover with no title and no description still announces as a dialog', async () => {
	await open(Unnamed);
	await readUntil(sr, { role: 'button', name: 'Open' });
	await pressTrigger();
	await readUntil(sr, { role: 'dialog' });
});

test('a popover served open is conveyed expanded and its surface is reachable', async () => {
	await open(ServedOpen);
	expectConveys(await readUntil(sr, { role: 'button', name: "What's new" }), {
		role: 'button',
		name: "What's new",
		state: ['expanded'],
	});
	expectConveys(await readUntil(sr, { role: 'dialog' }), {
		role: 'dialog',
		name: "What's new",
	});
});

test('Escape leaves the trigger conveying collapsed', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Share' });
	const trigger = await pressTrigger();

	await sr.press('Escape');
	await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('false');
	// Escape hands focus back to the trigger, so the reader follows it there and says so by itself.
	expectConveys(await sr.settleOnFocus(), {
		role: 'button',
		name: 'Share',
		state: ['notExpanded'],
	});
});

test('the surface is out of reach again after Escape', async () => {
	await open(Basic);
	await readUntil(sr, { role: 'button', name: 'Share' });
	const trigger = await pressTrigger();
	await readUntil(sr, { role: 'dialog', name: 'Share this page' });

	await sr.press('Escape');
	await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('false');
	await sr.settleOnFocus();
	expect(await walk(6)).not.toContain('Share this page');
});
