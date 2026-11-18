import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clampTo, describePace, dial, KM, paceOf, START } from './watch-model.ts';
import { drawing } from './watch.ts';

const watchArt = drawing();
const piece = readFileSync(new URL('./watch-anatomy.tsrx', import.meta.url), 'utf8');

describe('a running watch works out pace', () => {
	it('dials km and minutes and works pace out from both', () => {
		expect(START).toEqual({ km: 5, minutes: 25 });
		expect(paceOf(25, 5)).toBe('5.0');
		expect(paceOf(25, 6)).toBe('4.2');
		expect(clampTo(KM, 40)).toBe(21);
		expect(dial(KM, 5, 100, 82)).toBe(7);
		expect(describePace(5, 24)).toBe('5 km in 24 minutes, so pace is 4.8 minutes per km.');
	});

	it('works pace out only through computed; pressing it never sets it', () => {
		expect(piece).toContain('const pace = computed(() => paceOf(minutes, km));');
		const readout = piece.slice(piece.indexOf('class="readout pace"'), piece.indexOf('</g>', piece.indexOf('class="readout pace"')));
		expect(readout).not.toMatch(/\bpace\s*=|km\s*=|minutes\s*=/);
		expect(readout).toContain('shake = flip(shake)');
		expect(piece.match(/role="slider"/g)).toHaveLength(2);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('draws the same watch every time', () => {
		expect(watchArt.straps).toHaveLength(2);
		expect(watchArt.case.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(watchArt));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by watch.test.ts from watch.ts. Run the figure tests with -u to refresh.
import type { drawing } from './watch.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(watchArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./watch.art.ts');
	});
});
