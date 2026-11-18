import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing, PACKAGES } from './packages.ts';

const art = drawing();
const manifest = (name: string) => JSON.parse(readFileSync(new URL('../../../../packages/' + name + '/package.json', import.meta.url), 'utf8')) as { dependencies?: Record<string, string> };
const needs = (name: string) => Object.keys(manifest(name).dependencies ?? {}).filter((dep) => dep.startsWith('@markless/')).map((dep) => dep.slice('@markless/'.length)).sort();

describe('packages figure', () => {
	it('draws the same scene twice', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(art));
	});

	it('is frozen (refresh with -u after a geometry change)', async () => {
		const module = `// Written by reference.test.ts from packages.ts. Refresh with the figure tests and -u.
import type { drawing } from './packages.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./packages.art.ts');
	});

	it("lists each package's real @markless dependencies", () => {
		for (const pkg of PACKAGES) expect([...pkg.needs].sort()).toEqual(needs(pkg.name));
	});

	it('installs exactly what @markless/core pulls in, breadth first, each after the package that needs it', () => {
		const order: string[] = ['core'];
		for (let i = 0; i < order.length; i++) for (const dep of needs(order[i]!)) if (!order.includes(dep)) order.push(dep);
		expect(new Set(PACKAGES.map((pkg) => pkg.name))).toEqual(new Set(order));
		for (const pkg of PACKAGES) for (const dep of pkg.needs) expect(PACKAGES.findIndex((p) => p.name === dep)).toBeGreaterThan(0);
	});

	it('draws a missing mark for every dependency of every row', () => {
		for (const row of art.rows) expect(row.missing.map((m) => m.dep)).toEqual(PACKAGES[row.key]!.needs);
	});
});
