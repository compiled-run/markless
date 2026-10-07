import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

/**
 * A part that derives its place from its family's element roster needs the live
 * roster from the moment the page resumes. The page placing that part - however
 * deep the import chain - has to install the roster loader, and its own payload
 * holds no computed to tell it so. The module interface is how it learns.
 */
const familySource = `import { computed, element, shared, state } from '@markless/core';
export const beadState = shared(
	() => {
		const strand = state({ colors: 'rgb' });
		const beads = element<HTMLSpanElement[]>();
		return { ...strand, beads };
	},
	{ scope: 'widget' },
);
export function BeadStrand({ children }: { readonly children?: unknown }) @{
	const strand = beadState();
	<p>{children}</p>
}
export function Bead() @{
	const strand = beadState();
	const self = element<HTMLSpanElement>();
	const slot = computed(() => strand.beads.indexOf(self as HTMLSpanElement));
	<span el={[strand.beads, self]}>{strand.colors.slice(slot, slot + 1)}</span>
}
`;

test('a module deriving from an element roster says so for every component, transitively', async () => {
	const family = await compileTsrxModule({
		filename: 'src/beads.tsrx',
		source: familySource,
		symbols: [],
	});
	expect(
		family.moduleGraphInterface.render.components.map((component) => [
			component.componentName,
			component.rosterDerivation,
		]),
	).toEqual([
		['BeadStrand', true],
		['Bead', true],
	]);

	const necklace = await compileTsrxModule({
		filename: 'src/necklace.tsrx',
		source: `import { Bead, BeadStrand } from './beads.tsrx';
export function Necklace() @{
	<BeadStrand><Bead /><Bead /></BeadStrand>
}
export function Clasp() @{
	<i>clasp</i>
}
`,
		symbols: [],
		importedModuleInterfaces: { './beads.tsrx': family.moduleGraphInterface },
	});
	expect(
		Object.fromEntries(
			necklace.moduleGraphInterface.render.components.map((component) => [
				component.componentName,
				component.rosterDerivation,
			]),
		),
	).toEqual({ Necklace: true, Clasp: undefined });

	const page = await compileTsrxModule({
		filename: 'src/page.tsrx',
		source: `import { Necklace } from './necklace.tsrx';
export default function Page() @{
	<main><Necklace /></main>
}
`,
		symbols: [],
		importedModuleInterfaces: { './necklace.tsrx': necklace.moduleGraphInterface },
	});
	expect(page.protocolState.computed ?? []).toEqual([]);
	expect(page.moduleGraphInterface.render.components[0]).toMatchObject({
		componentName: 'Page',
		rosterDerivation: true,
	});
});

test('a computed that reads no element roster leaves the interface as it was', async () => {
	const plain = await compileTsrxModule({
		filename: 'src/tally.tsrx',
		source: `import { computed, state } from '@markless/core';
export function Tally() @{
	let count = state(1);
	const doubled = computed(() => count * 2);
	<output>{doubled}</output>
}
`,
		symbols: [],
	});
	expect(plain.moduleGraphInterface.render.components[0]).not.toHaveProperty('rosterDerivation');
});
