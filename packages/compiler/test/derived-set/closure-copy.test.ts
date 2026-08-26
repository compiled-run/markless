import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics } from '../../src/index.ts';
import { compileTsrxModulesWithInterfaces } from '../multi-module-compile-support.ts';

// A module that reads one cell of a shared() factory used to rebuild the
// instance from EVERY returned property, so a three-cell factory read for one
// leaf put all three in the reading module. A member outside the set the text
// reads is never derived there, so it read undefined whether it was listed or
// not; listing it only carried the factory's whole surface into every page.

const FAMILY = `
import { shared, state, computed } from '@markless/core';

export const box = shared(() => {
	const s = state({ base: 2, other: 9 });
	const doubled = computed(() => s.base * 2);
	const leaf = computed(() => doubled() + 1);
	const unrelated = computed(() => s.other * 3);
	return { ...s, doubled, leaf, unrelated };
}, { scope: 'widget' });

export default function Family() @{
	const b = box();
	<div data-family>{b.leaf}</div>
}
`;

// Same structure, every name and the declaration order changed: the narrowing
// has to come off the graph, not off anything this fixture spells.
const OTHER_FAMILY = `
import { shared, state, computed } from '@markless/core';

export const panel = shared(() => {
	const held = state({ spare: 'x', tip: 'y' });
	const sideline = computed(() => held.spare.length);
	const stem = computed(() => held.tip.length);
	const crown = computed(() => stem() + 1);
	return { ...held, sideline, stem, crown };
}, { scope: 'widget' });

export default function Panel() @{
	const p = panel();
	<section data-panel>{p.crown}</section>
}
`;

async function compileConsumer(family: string, consumer: string) {
	const results = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/family.tsrx', source: family, importSource: './family.tsrx' },
		{ filename: 'src/consumer.tsrx', source: consumer },
	]);
	const compiled = results.at(-1)!;
	expect(
		collectTsrxModuleDiagnostics(compiled).filter((item) => item.severity === 'error'),
	).toEqual([]);
	return compiled.publicRenderModule.ssrModuleSource;
}

/** The members of the instance the emitted module rebuilds under `localName`. */
function rebuiltMembers(ssr: string, localName: string): ReadonlyArray<string> {
	const literal = new RegExp(`const ${localName} = \\{([^}]*)\\}`).exec(ssr);
	expect(literal, `no rebuilt instance for "${localName}"`).not.toBeNull();
	return [...literal![1]!.matchAll(/"([^"]+)":/g)].map((match) => match[1]!);
}

test('a consumer reading one leaf rebuilds that leaf only', async () => {
	const ssr = await compileConsumer(
		FAMILY,
		`
import { computed } from '@markless/core';
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	const view = computed(() => b.leaf + 100);
	<div>{view}</div>
}
`,
	);

	expect(rebuiltMembers(ssr, 'b')).toEqual(['leaf']);
});

test('the leaf carries its own dependencies and nothing beside them', async () => {
	const ssr = await compileConsumer(
		FAMILY,
		`
import { computed } from '@markless/core';
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	const view = computed(() => b.leaf + 100);
	<div>{view}</div>
}
`,
	);

	// The transitive closure of the read cell derives; the sibling cell does not.
	expect(ssr).toContain('#box/computed:leaf"');
	expect(ssr).toContain('#box/computed:doubled"');
	expect(ssr).not.toContain('#box/computed:unrelated"');
});

test('two reads of one instance keep both members', async () => {
	const ssr = await compileConsumer(
		FAMILY,
		`
import { computed } from '@markless/core';
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	const view = computed(() => b.leaf + b.other);
	<div>{view}</div>
}
`,
	);

	expect([...rebuiltMembers(ssr, 'b')].sort()).toEqual(['leaf', 'other']);
});

test('the same narrowing holds for a differently shaped factory', async () => {
	const ssr = await compileConsumer(
		OTHER_FAMILY,
		`
import { computed } from '@markless/core';
import { panel } from './family.tsrx';

export default function Page() @{
	const p = panel();
	const label = computed(() => p.crown + 5);
	<article>{label}</article>
}
`,
	);

	expect(rebuiltMembers(ssr, 'p')).toEqual(['crown']);
	expect(ssr).toContain('#panel/computed:stem"');
	expect(ssr).not.toContain('#panel/computed:sideline"');
});

// A composite residue names no graph node the render data carries, so the cell
// behind it used to reach the derive set through nothing at all: the rebuilt
// local read the state map's undefined and the text it fed was served empty.
test('a cell read only through a composite residue still derives', async () => {
	const ssr = await compileConsumer(
		FAMILY,
		`
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	<div title={b.leaf > 3 ? 'big' : 'small'}>x</div>
}
`,
	);

	expect(ssr).toContain('#box/computed:leaf"');
	expect(ssr).toContain('#box/computed:doubled"');
	expect(ssr).not.toContain('#box/computed:unrelated"');
});

// The defining module's own render narrows the same way: nothing about the
// change is keyed on the reading module being a different file.
test('the defining module derives the read cell and not its sibling', async () => {
	const results = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/family.tsrx', source: FAMILY, importSource: './family.tsrx' },
	]);
	const ssr = results[0]!.publicRenderModule.ssrModuleSource;

	expect(ssr).toContain('#box/computed:leaf"');
	expect(ssr).not.toContain('#box/computed:unrelated"');
});
