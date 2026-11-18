import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CITIES, claim, describeBoard, isNewest, nameOf } from './board-model.ts';
import { drawing } from './board.ts';

const boardArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/async.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./board-anatomy.tsrx', import.meta.url), 'utf8');

describe('the flap board', () => {
	it('keeps only the newest pick, and names each part for the caption', () => {
		expect(CITIES.map((c) => c.name)).toEqual(['Austin', 'Boston', 'Denver']);
		const first = claim();
		const second = claim();
		expect([isNewest(first), isNewest(second)]).toEqual([false, true]);
		expect(nameOf('temp', 'first', 'Austin')).toBe('@pending: no answer yet');
		expect(nameOf('temp', 'refresh', 'Austin')).toBe('aria-busy: the old answer stays until the new one lands');
		expect(nameOf('temp', 'landed', 'Austin')).toBe('@try: the answer landed');
		expect(nameOf('city', 'landed', 'Austin')).toBe('{city} is plain state, so it changes at once');
		expect(nameOf('key', 'landed', 'Boston')).toBe("city = 'Boston'");
		expect(describeBoard('dropped', 'Boston')).toBe("Boston's answer came back after a newer pick, so it was thrown away.");
	});

	it('spins the temperature flaps only on the first load, marks a refresh busy, and drops a stale answer', () => {
		expect(piece).toContain(".scene[data-stage='first'] .temp .half.top");
		expect(piece).toContain("aria-busy={stage === 'refresh' ? 'true' : undefined}");
		expect(piece).toContain('if (isNewest(mine)) {');
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).toContain('class="caption"');
		expect(piece).not.toMatch(/class="cord"|art\.wires/);
	});

	it('draws the same board every time, with one well per cell', () => {
		expect(boardArt.frame.wells).toHaveLength(2);
		expect(boardArt.flaps.temp.top.length).toBeGreaterThan(100);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(boardArt));
	});

	it('is on the Async page under the first section', () => {
		expect(page).toContain("import BoardAnatomy from '../../components/figures/async/board-anatomy.tsrx';");
		expect(page.indexOf('## Only the slow spot waits')).toBeLessThan(page.indexOf('<BoardAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by board.test.ts from board.ts. Run the figure tests with -u to refresh.
import type { drawing } from './board.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(boardArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./board.art.ts');
	});
});
