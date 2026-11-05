import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addressOf, FOLDERS, NAMES } from './explorer.ts';

const site = (path: string) => new URL('../../../' + path, import.meta.url);
const router = readFileSync(new URL('../../../../packages/router/src/vite/index.ts', import.meta.url), 'utf8');
const toy = readFileSync(new URL('./explorer-figure.tsrx', import.meta.url), 'utf8');

describe('improve the docs explorer figure', () => {
	it('names real folders and real concept pages', () => {
		for (const folder of FOLDERS) expect(existsSync(site(folder))).toBe(true);
		for (const name of NAMES) expect(existsSync(site('pages/concepts/' + name + '.mdx'))).toBe(true);
	});

	it('serves a file at its path under pages/, and nothing outside it', () => {
		expect(router).toContain("const pagesDir = join(root, 'pages');");
		expect(addressOf('pages/concepts/', 'state')).toBe('/concepts/state');
		expect(addressOf('pages/', 'state')).toBe('/state');
		expect(addressOf('components/', 'state')).toBe('');
	});

	it('teaches the textbook column with a subtitles toggle, not a counter', () => {
		const notes = readFileSync(new URL('./subtitles-notes.tsrx', import.meta.url), 'utf8');
		const page = readFileSync(site('pages/contributing/improve-the-docs.mdx'), 'utf8');
		expect(notes).toContain('let subtitles = state(false);');
		expect(notes).toContain('CC');
		expect(page).toContain('subtitles-notes.tsrx');
		expect(page).toContain('```tsrx title="subtitles.tsrx"');
		expect(page).not.toMatch(/tally\.tsrx|Typos fixed/);
	});

	it('answers press, drag and keys, speaks each change, and drops animation under reduced motion', () => {
		for (const hook of ['onDrop', 'draggable={true}', 'onClick={() => rename()}', "event.key !== 'Escape'", 'aria-live="polite"', 'prefers-reduced-motion: reduce']) expect(toy).toContain(hook);
	});
});
