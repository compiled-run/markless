import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clock, EXEC_KB, executedSoFar, fill, FIRST_CLICK_S, ready, SPEED } from './race-model.ts';
import { drawing } from './race.ts';

const sceneArt = drawing();
const page = readFileSync(new URL('../../../pages/how-it-works/index.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./race-anatomy.tsrx', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../../../../README.md', import.meta.url), 'utf8');

describe('the shadcn/ui race', () => {
	it('uses the README numbers, labelled as executed at load and first click on 3G', () => {
		expect(readme).toContain(`| ${EXEC_KB.original.toLocaleString('en-US')} kB | ${EXEC_KB.port} kB |`);
		expect(readme).toContain(`${FIRST_CLICK_S.port} s instead of ${FIRST_CLICK_S.original} s`);
		expect(piece).toContain('executed at load');
	});

	it('keeps the real ratio while playing faster than real time', () => {
		const portMs = FIRST_CLICK_S.port * SPEED * 1000;
		expect(ready('port', portMs)).toBe(true);
		expect(ready('original', portMs)).toBe(false);
		expect(executedSoFar('port', portMs)).toBe(EXEC_KB.port);
		expect(fill('port', portMs)).toBeCloseTo(131 / 1403, 3);
		expect(clock('original', 99999)).toBe('14.6 s');
	});

	it('links both live previews as work in progress, cites the source, and draws the same scene every time', () => {
		expect(piece).toContain('work-in-progress previews, not official shadcn/ui sites');
		expect(piece).toContain('href={SOURCE}');
		expect(page).toContain("from '../../components/figures/how-index/race-anatomy.tsrx';");
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(sceneArt));
	});
});

describe('frozen art', () => {
	it('freezes the drawing (run with -u after editing)', async () => {
		await expect(`// Written by race.test.ts from race.ts. Run the figure test with -u to refresh.
import type { drawing } from './race.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(sceneArt, null, '\t')};
`).toMatchFileSnapshot('./race.art.ts');
	});
});
