import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { changedSlots, describeSongs, landing, nextSong, START, trackClass } from './jcard-model.ts';
import { drawing } from './jcard.ts';

const jcardArt = drawing();
const piece = readFileSync(new URL('./jcard-anatomy.tsrx', import.meta.url), 'utf8');

describe('a J-card track list wired line by line', () => {
	it('adds, moves and re-inks only the lines that changed', () => {
		expect(START).toEqual(['So What', 'Blue in Green', 'Freddie']);
		expect(nextSong(START)).toBe('All Blues');
		expect(changedSlots(['a', 'b', 'c'], ['a', 'b', 'c', 'd'])).toEqual([3]);
		expect(changedSlots(['a', 'b', 'c'], ['b', 'a', 'c'])).toEqual([0, 1]);
		expect(landing(0, 90, 3)).toBe(2);
		expect(landing(2, -200, 3)).toBe(0);
		expect(trackClass(3, 3, [], 'odd', -1)).toBe('track');
		expect(trackClass(4, 3, [3], 'odd', -1)).toBe('track on reink-odd');
		expect(describeSongs('Added Milestones', ['a', 'b'], [1])).toBe('Added Milestones: a, b. Only one line on the page changed; the rest stayed as they were.');
	});

	it('changes the array in place, as the page teaches', () => {
		expect(piece).toContain('songs.push(song);');
		expect(piece).toContain('songs.pop();');
		expect(piece).toContain('songs.splice(from, 1);');
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('draws five wired lines, the same every time', () => {
		expect(jcardArt.wires).toHaveLength(5);
		expect(jcardArt.rows).toHaveLength(5);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(jcardArt));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by jcard.test.ts from jcard.ts. Run the figure tests with -u to refresh.
import type { drawing } from './jcard.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(jcardArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./jcard.art.ts');
	});
});
