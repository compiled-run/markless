import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { caseOf, describeNote, describeStatus, formatSeconds, LENGTH, scrubTo, statusOf, stepSeconds } from './player-model.ts';
import { drawing } from './player.ts';

const playerArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/conditionals.mdx', import.meta.url), 'utf8');
const note = readFileSync(new URL('./pause-note-anatomy.tsrx', import.meta.url), 'utf8');
const status = readFileSync(new URL('./status-anatomy.tsrx', import.meta.url), 'utf8');

describe('the video player model', () => {
	it('picks one status from the position and the play state', () => {
		expect(statusOf(false, false, 0)).toBe('loading');
		expect(statusOf(true, true, 10)).toBe('playing');
		expect(statusOf(true, false, 10)).toBe('paused');
		expect(statusOf(true, true, LENGTH)).toBe('ended');
		expect(caseOf('paused')).toBe('@default');
		expect(caseOf('ended')).toBe("@case 'ended'");
	});

	it('scrubs along the track and stays inside the video', () => {
		expect(scrubTo(0, 200, 400)).toBe(LENGTH / 2);
		expect(scrubTo(80, 400, 400)).toBe(LENGTH);
		expect(scrubTo(10, -400, 400)).toBe(0);
		expect(formatSeconds(65)).toBe('1:05');
		expect(stepSeconds(0, 'ArrowRight')).toBe(5);
		expect(stepSeconds(0, 'ArrowLeft')).toBe(0);
		expect(stepSeconds(3, 'End')).toBe(LENGTH);
		expect(stepSeconds(3, 'a')).toBeUndefined();
	});

	it('says what one press did', () => {
		expect(describeStatus('playing', 5)).toBe('The video is playing at 0:05, and the card reads playing.');
		expect(describeStatus('ended', LENGTH)).toBe('The video reached the end, so the card reads ended.');
		expect(describeNote('gone', 'Great shot')).toBe('Playing. The note field left the page, and "Great shot" went with it.');
		expect(describeNote('fresh', '')).toBe('Paused. A fresh, empty note field was built.');
	});
});

describe('the note field under a paused video', () => {
	it('builds the field inside an @if with nothing bound to it, and never hides it with CSS', () => {
		expect(note).toContain('@if (!playing) {');
		expect(note).not.toContain('value={');
		expect(note).not.toMatch(/display:\s*none|visibility:\s*hidden|\shidden=/);
		expect(note).toContain('aria-live="polite"');
		expect(note).toContain('prefers-reduced-motion: reduce');
	});
});

describe('the status card', () => {
	it('shows one card per case through a real @switch, with a default', () => {
		expect(status).toContain('@switch (status) {');
		expect(status.match(/@case '(loading|playing|ended)': \{/g)).toHaveLength(3);
		expect(status).toContain('@default: {');
		expect(status).toContain('role="slider"');
		expect(status).toContain('aria-live="polite"');
		expect(status).toContain('prefers-reduced-motion: reduce');
	});
});

describe('the drawing', () => {
	it('draws the same player every time, with enough ink to read', () => {
		expect(playerArt.screen.ink.length).toBeGreaterThan(400);
		expect(playerArt.screen.scene.length).toBeGreaterThan(400);
		expect(playerArt.bar.length).toBeGreaterThan(300);
		for (const card of Object.values(playerArt.cards)) expect(card.mark.length).toBeGreaterThan(40);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(playerArt));
	});

	it('is on the Conditionals page, one figure per idea', () => {
		expect(page).toContain("import PauseNoteAnatomy from '../../components/figures/conditionals/pause-note-anatomy.tsrx';");
		expect(page).toContain("import StatusAnatomy from '../../components/figures/conditionals/status-anatomy.tsrx';");
		expect(page.indexOf('## A closed `@if` is gone, not covered')).toBeLessThan(page.indexOf('<PauseNoteAnatomy />'));
		expect(page.indexOf('## `@switch` picks one case')).toBeLessThan(page.indexOf('<StatusAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by player.test.ts from player.ts. Run the figure tests with -u to refresh.
import type { drawing } from './player.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(playerArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./player.art.ts');
	});
});
