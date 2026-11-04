import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { familyNames } from '../components/docs/api-derive/manifest.ts';
import { deriveParts, establishedRoles, roleOf } from './ui-parts.ts';

const derived = await deriveParts(familyNames());

describe('ui parts', () => {
	it('reads the roles from SPEC.md', () => {
		const spec = readFileSync(new URL('../../packages/headless/components/SPEC.md', import.meta.url), 'utf8');
		const roles = establishedRoles(spec);
		expect(roles).toContain('trigger');
		expect(roleOf('itemtrigger', roles)).toBe('trigger');
		expect(roleOf('itemdescription', roles)).toBe('description');
		expect(roleOf('list', roles)).toBe('');
	});

	it('finds the element every part renders', () => {
		const missing = Object.entries(derived).flatMap(([family, parts]) =>
			parts.filter((part) => part.element === '').map((part) => `${family}.${part.part}`),
		);
		expect(missing).toEqual([]);
	});

	it('matches the frozen file (run with -u after a family changes)', async () => {
		const module = `// Written by tooling/ui-parts.test.ts from the @markless/ui source and SPEC.md. Refresh with -u.
import type { PartFacts } from './types.ts';

export const parts: Readonly<Record<string, readonly PartFacts[]>> = ${JSON.stringify(derived, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('../components/docs/ui-parts/parts.data.ts');
	});
});
