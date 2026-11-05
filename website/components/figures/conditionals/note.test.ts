import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addLetter, BIN_REACH, describeNote } from './note-model.ts';
import { drawing } from './note.ts';

const noteArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/conditionals.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./note-anatomy.tsrx', import.meta.url), 'utf8');

describe('the sticky note and the bin', () => {
	it('says the note is gone, then that a fresh one is built', () => {
		expect(addLetter('Hi', '!')).toBe('Hi!');
		expect(BIN_REACH).toBeGreaterThan(100);
		expect(describeNote('binned')).toBe('The note is gone, and what you wrote went with it. The sheet underneath is bare.');
		expect(describeNote('open')).toBe('A fresh, blank note is built on the sheet.');
	});

	it('builds the note inside an @if, and every reopen starts blank', () => {
		expect(piece).toContain('@if (open) {');
		expect(piece).not.toMatch(/display:\s*none|visibility:\s*hidden|\shidden=/);
		const reopen = piece.slice(piece.indexOf('class="sheet"'), piece.indexOf('<path class="shadow"'));
		expect(reopen.match(/text = '';/g)).toHaveLength(2);
		expect(piece).not.toMatch(/class="cord"|art\.wires|class="hand/);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('draws the same scene every time', () => {
		expect(noteArt.bin.balls).toHaveLength(3);
		expect(noteArt.note.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(noteArt));
	});

	it('is on the Conditionals page under its own heading', () => {
		expect(page).toContain("import NoteAnatomy from '../../components/figures/conditionals/note-anatomy.tsrx';");
		expect(page.indexOf('## Close it, open it again')).toBeLessThan(page.indexOf('<NoteAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by note.test.ts from note.ts. Run the figure tests with -u to refresh.
import type { drawing } from './note.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(noteArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./note.art.ts');
	});
});
