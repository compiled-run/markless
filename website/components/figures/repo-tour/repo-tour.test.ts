import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing, PACKAGES } from './tree.ts';

const art = drawing();
const root = new URL('../../../../', import.meta.url);
const imports = (name: string) => {
	const found = new Set<string>();
	const walk = (dir: URL) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) walk(new URL(entry.name + '/', dir));
			else if (/\.(ts|tsrx)$/.test(entry.name)) for (const m of readFileSync(new URL(entry.name, dir), 'utf8').matchAll(/from '@markless\/([a-z-]+)/g)) found.add(m[1]!);
		}
	};
	walk(new URL('packages/' + name + '/src/', root));
	return found;
};

describe('repo tour figure', () => {
	it('draws the same scene twice', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(art));
	});

	it('is frozen (refresh with -u after a geometry change)', async () => {
		const module = `// Written by repo-tour.test.ts from tree.ts. Refresh with the figure tests and -u.
import type { drawing } from './tree.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./tree.art.ts');
	});

	it('lists packages/ exactly as it is in the repo', () => {
		const dirs = readdirSync(new URL('packages/', root), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
		expect(PACKAGES.map((p) => p.name)).toEqual(dirs);
	});

	it('names imports each pipeline package really has, and web never imports core', () => {
		for (const name of ['bundler', 'web', 'runtime', 'core']) for (const dep of PACKAGES.find((p) => p.name === name)!.imports) expect(imports(name)).toContain(dep);
		expect(imports('serializer').size).toBe(0);
		expect(imports('web')).not.toContain('core');
		expect(PACKAGES.find((p) => p.name === 'core')!.imports).toContain('web');
	});

	it('is not a counter', () => {
		const words = JSON.stringify(art);
		expect(words).not.toMatch(/count|Count/);
	});
});
