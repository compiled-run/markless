import { render } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { missingFacts, readUntil, type Conveys } from '../../test-support/driver.ts';
import { virtualDriver } from '../../test-support/virtual-driver.ts';
import Basic from './scenarios/basic.tsrx';
import University from './scenarios/university.tsrx';

// Rows assert the facts an announcement must convey - role, name, state - never a reader product's wording.
const sr = virtualDriver;

async function open(component: Parameters<typeof render>[0]) {
	const { container } = await render(component);
	await sr.start(container as unknown as HTMLElement);
}

afterEach(async () => {
	await sr.stop().catch(() => {});
});

function expectConveys(phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

/** Walks forward rather than re-reading in place: opening a dropdown grows the tree under the cursor, so a re-read lands on the newly revealed links. */
async function expectAnnouncesAfterChange(conveys: Conveys) {
	await expect
		.poll(async () => {
			await sr.next();
			return missingFacts(sr, await sr.lastSpokenPhrase(), conveys);
		})
		.toEqual([]);
}

// Nothing-changed is not something a poll can wait for, so give the dispatch the room a real activation gets.
async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 150));
}

test('entering the navbar conveys the navigation landmark and its name', async () => {
	await open(University);
	expectConveys(await readUntil(sr, { role: 'navigation' }), {
		role: 'navigation',
		name: 'Mythical University',
	});
});

test('reading the first entry conveys the button role, its name and that it is collapsed', async () => {
	await open(University);
	expectConveys(await readUntil(sr, { role: 'button', name: 'About' }), {
		role: 'button',
		name: 'About',
		state: ['notExpanded'],
	});
});

test('the other two entries convey their own names as collapsed buttons', async () => {
	await open(University);
	expectConveys(await readUntil(sr, { role: 'button', name: 'Academics' }), {
		role: 'button',
		name: 'Academics',
		state: ['notExpanded'],
	});
	expectConveys(await readUntil(sr, { role: 'button', name: 'Admissions' }), {
		role: 'button',
		name: 'Admissions',
		state: ['notExpanded'],
	});
});

// Why the family uses `hidden` rather than a styled-away wrapper: a reader must not be able to walk into a closed dropdown.
test('the links inside a closed dropdown are not reachable', async () => {
	await open(University);
	await readUntil(sr, { role: 'button', name: 'About' });
	const walked: string[] = [];
	for (let step = 0; step < 8; step++) {
		await sr.next();
		walked.push(await sr.lastSpokenPhrase());
	}
	expect(walked.join(' | ')).not.toContain('Overview');
	expect(walked.join(' | ')).not.toContain('Campus Tours');
});

// A navbar built as a menubar puts a reader into application mode and promises desktop-menu behaviour site navigation does not have.
test('nothing in the navbar is announced as a menu', async () => {
	await open(University);
	await readUntil(sr, { role: 'navigation' });
	const walked: string[] = [];
	for (let step = 0; step < 12; step++) {
		await sr.next();
		walked.push(await sr.lastSpokenPhrase());
	}
	const transcript = walked.join(' | ');
	expect(transcript).not.toContain('menubar');
	expect(transcript).not.toContain('menuitem');
});

// The change is its own assertion: a family that only reveals the new state on the next focus fails this row.
test('pressing enter on an entry announces it as expanded', async () => {
	await open(University);
	await readUntil(sr, { role: 'button', name: 'About' });
	await sr.press(sr.keys.enter);
	await expectAnnouncesAfterChange({
		role: 'button',
		name: 'About',
		state: ['expanded'],
	});
});

test('the links inside an opened dropdown become reachable and convey the link role', async () => {
	await open(University);
	await readUntil(sr, { role: 'button', name: 'About' });
	await sr.press(sr.keys.enter);
	await settle();
	expectConveys(await readUntil(sr, { role: 'link', name: 'Overview' }), {
		role: 'link',
		name: 'Overview',
	});
});

test('the link for the page a person is on conveys that it is the current page', async () => {
	await open(University);
	await readUntil(sr, { role: 'button', name: 'About' });
	await sr.press(sr.keys.enter);
	await settle();
	expectConveys(await readUntil(sr, { role: 'link', name: 'Campus Tours' }), {
		role: 'link',
		name: 'Campus Tours',
		state: ['currentPage'],
	});
});

test('a link that is not the current page says nothing about being current', async () => {
	await open(University);
	await readUntil(sr, { role: 'button', name: 'About' });
	await sr.press(sr.keys.enter);
	await settle();
	const phrase = await readUntil(sr, { role: 'link', name: 'Overview' });
	expect(phrase).not.toContain(sr.vocabulary.currentPage);
});

// 'Escape' is spelled literally rather than taken off `sr.keys`: that table names the reader's own commands, and Escape is a browser key readers pass through.
test('pressing escape inside a dropdown announces the entry as collapsed again', async () => {
	await open(University);
	await readUntil(sr, { role: 'button', name: 'About' });
	await sr.press(sr.keys.enter);
	await settle();
	await readUntil(sr, { role: 'link', name: 'Overview' });

	await sr.press('Escape');
	await expectAnnouncesAfterChange({
		role: 'button',
		name: 'About',
		state: ['notExpanded'],
	});
});

test('the page content beside the navbar conveys its region role and name', async () => {
	await open(University);
	expectConveys(await readUntil(sr, { role: 'region' }), {
		role: 'region',
		name: 'Mythical University sample page content',
	});
});

// A plain top-level link sits next to the entries that open dropdowns, and a reader has to tell them apart by role.
test('a plain top-level entry conveys the link role, not the button role', async () => {
	await open(Basic);
	expectConveys(await readUntil(sr, { role: 'link', name: 'Home' }), {
		role: 'link',
		name: 'Home',
	});
	expectConveys(await readUntil(sr, { role: 'button', name: 'Products' }), {
		role: 'button',
		name: 'Products',
		state: ['notExpanded'],
	});
});
