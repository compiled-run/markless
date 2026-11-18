import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing, SIDES, STOPS } from './tour.ts';

const art = drawing();
const repo = new URL('../../../../', import.meta.url);
const deps = (name: string) => Object.keys(JSON.parse(readFileSync(new URL(`packages/${name}/package.json`, repo), 'utf8')).dependencies ?? {}).filter((d) => d.startsWith('@markless/')).map((d) => d.slice('@markless/'.length));

describe('repo tour figure', () => {
	it('draws the same scene twice', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(art));
	});

	it('is frozen (refresh with -u after a geometry change)', async () => {
		const module = `// Written by repo-tour.test.ts from tour.ts. Refresh with the figure tests and -u.
import type { drawing } from './tour.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./tour.art.ts');
	});

	it('names real folders and files at every package stop', () => {
		for (const stop of STOPS.filter((s) => s.name !== 'browser')) {
			expect(existsSync(new URL(stop.path, repo))).toBe(true);
			for (const file of stop.files) expect(existsSync(new URL(stop.path + file, repo)), stop.path + file).toBe(true);
		}
	});

	it('follows the real wiring: core takes the bundler plugin, the bundler and router call the compiler, web and serializer feed the browser, runtime sits under web', () => {
		expect(readFileSync(new URL('packages/core/src/vite.ts', repo), 'utf8')).toContain("from '@markless/bundler/vite'");
		expect(deps('bundler')).toContain('compiler');
		expect(deps('router')).toEqual(expect.arrayContaining(['bundler', 'compiler', 'web']));
		expect(deps('web')).toEqual(expect.arrayContaining(['runtime', 'serializer']));
		expect(deps('runtime')).toEqual(['serializer']);
		expect(STOPS.map((s) => s.name)).toEqual(['core', 'compiler', 'bundler', 'router', 'serializer', 'web', 'runtime', 'browser']);
	});

	it('hangs every side package off the route, and each one exists', () => {
		const dirs: Record<string, string> = { 'create-markless': 'packages/cli', ui: 'packages/headless/components', 'typescript-plugin': 'packages/typescript-plugin', 'vitest-browser': 'packages/vitest-browser', analyzer: 'packages/analyzer' };
		for (const side of SIDES) expect(existsSync(new URL(dirs[side.name]!, repo)), side.name).toBe(true);
		expect(art.sides).toHaveLength(SIDES.length);
	});

	it('moves the file card to each stop, and is not a counter', () => {
		expect(art.stops.map((s) => s.move)[0]).toBe('translate(0px, 0px)');
		expect(new Set(art.stops.map((s) => s.move)).size).toBe(STOPS.length);
		expect(JSON.stringify(art)).not.toMatch(/count/i);
	});
});
