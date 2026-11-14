import { expect, test } from 'vitest';
import type { RuntimeGraph } from '@markless/runtime';
import { branchOwnerPlacement } from '../src/prerender/owner-placement.ts';

// Which tail of a flip's page path its owner's module spells, read from the chains the compiler emitted for the owner.

const edge = (index: number) => ({ id: `component-edge:${index}`, symbolPrefix: `c${index}:` });
const surface = {
	components: {
		First: { edges: [edge(1)] },
		Middle: { edges: [edge(2)] },
		Rows: { edges: [edge(3)] },
		Owner: {
			edges: [edge(0)],
			placements: [
				[{ edgeId: 'component-edge:1' }, { edgeId: 'component-edge:2' }],
				[{ edgeId: 'component-edge:3', rows: 1 }],
			],
		},
	},
};
const at = (marklessInstancePath: string) => ({ marklessInstancePath }) as unknown as RuntimeGraph;
const placed = (path: string) => {
	const placement = branchOwnerPlacement(surface, 'Owner', at(path));
	return placement && { ...placement, above: placement.above?.map((step) => [step.edge.id, step.path]) };
};

test('a chain names the module root above it and each edge on the way down', () => {
	expect(placed('c0:c1:c2:')).toEqual({
		moduleRootPath: 'c0:',
		ownerPath: 'c1:c2:',
		above: [
			['component-edge:1', 'c1:'],
			['component-edge:2', 'c1:c2:'],
		],
	});
});

test("a row the chain's own edge sits in belongs to the module; one before it belongs to the file that placed the root", () => {
	expect(placed('r:7:c0:r:2:c3:')).toEqual({
		moduleRootPath: 'r:7:c0:',
		ownerPath: 'r:2:c3:',
		above: [['component-edge:3', 'r:2:c3:']],
	});
	expect(placed('r:7:c1:c2:')).toMatchObject({ moduleRootPath: 'r:7:', ownerPath: 'c1:c2:' });
});

test('an owner no chain spells was placed by another file, at its own module root', () => {
	expect(placed('c0:c3:')).toEqual({ moduleRootPath: 'c0:c3:', ownerPath: '' });
	expect(placed('c0:c2:')).toEqual({ moduleRootPath: 'c0:c2:', ownerPath: '' });
});
