import { expect, test } from 'vitest';
import type { RuntimeGraph } from '@markless/runtime';
import { branchOwnerPlacement } from '../src/prerender/owner-placement.ts';

// Which tail of a flip's page path its owner's file spells, read from the chains the compiler emitted for the owner.

const throughMiddle = [
	{ edgeId: 'component-edge:1', prefix: 'c1:' },
	{ edgeId: 'component-edge:2', prefix: 'c2:' },
];
const inRows = [{ edgeId: 'component-edge:3', prefix: 'c3:', rows: 1 }];
const surface = { components: { Owner: { placements: [throughMiddle, inRows] } } };
const at = (marklessInstancePath: string) => ({ marklessInstancePath }) as unknown as RuntimeGraph;
const placed = (path: string) => branchOwnerPlacement(surface, 'Owner', at(path));

test('a chain names the module root above it and the owner path below', () => {
	expect(placed('c0:c1:c2:')).toEqual({ moduleRootPath: 'c0:', ownerPath: 'c1:c2:', chain: throughMiddle });
});

test("a row the chain's own edge sits in belongs to the module; one before it belongs to the file that placed the root", () => {
	expect(placed('r:7:c0:r:2:c3:')).toEqual({ moduleRootPath: 'r:7:c0:', ownerPath: 'r:2:c3:', chain: inRows });
	expect(placed('r:7:c1:c2:')).toEqual({ moduleRootPath: 'r:7:', ownerPath: 'c1:c2:', chain: throughMiddle });
});

test('an owner no chain spells was placed by another file, at its own module root', () => {
	expect(placed('c0:c3:')).toEqual({ moduleRootPath: 'c0:c3:', ownerPath: '' });
	expect(placed('c0:c2:')).toEqual({ moduleRootPath: 'c0:c2:', ownerPath: '' });
});
