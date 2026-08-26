import { expect, test } from 'vitest';
import { bindingOf, compileModule, dependencyEdges, errorCodes } from './support.ts';

/**
 * Two parts in one module may each declare `state`, `element()` and `computed()`
 * under the same local name. The graph node id is a serialized wire key minted
 * from the local name alone, so both parts mint `state:s` and `computed:label`.
 * Everything that consumes the id must therefore ask which component declared
 * the binding; matching on the id alone cross-wires the two parts.
 */

const SIBLINGS = `
import { computed, element, state } from '@markless/core';

function Reader() @{
	const s = state({ tick: 0 });
	const boxEl = element<HTMLDivElement>();
	const label = computed(() => \`\${s.tick}|r\`);

	<div data-label={label} el={boxEl}>reader</div>
}

export default function Writer() @{
	const s = state({ beat: 0 });
	const boxEl = element<HTMLDivElement>();
	const label = computed(() => \`\${s.beat}|w\`);

	<section data-label={label}>
		<div el={boxEl} onClick={() => (s.beat = s.beat + 1)}>writer</div>
		<Reader />
	</section>
}
`;

test('each sibling derive keeps only the cells its own body reads', async () => {
	const compiled = await compileModule('src/Siblings.tsrx', SIBLINGS);

	expect(errorCodes(compiled)).toEqual([]);
	expect(dependencyEdges(bindingOf(compiled, 'Reader', 'label'))).toEqual(['state:s:tick']);
	expect(dependencyEdges(bindingOf(compiled, 'Writer', 'label'))).toEqual(['state:s:beat']);
});

test('the colliding ids themselves are left alone', async () => {
	const compiled = await compileModule('src/Siblings.tsrx', SIBLINGS);

	expect(bindingOf(compiled, 'Reader', 's')?.id).toBe('state:s');
	expect(bindingOf(compiled, 'Writer', 's')?.id).toBe('state:s');
	expect(bindingOf(compiled, 'Reader', 'label')?.id).toBe('computed:label');
	expect(bindingOf(compiled, 'Writer', 'label')?.id).toBe('computed:label');
	expect(bindingOf(compiled, 'Reader', 'boxEl')?.id).toBe('element:boxEl');
	expect(bindingOf(compiled, 'Writer', 'boxEl')?.id).toBe('element:boxEl');
});

test('a derive still collects every cell its own body reads', async () => {
	const compiled = await compileModule(
		'src/Multi.tsrx',
		`
import { computed, state } from '@markless/core';

function Small() @{
	const s = state({ tick: 0 });
	const label = computed(() => \`\${s.tick}\`);

	<div>{label}</div>
}

export default function Large() @{
	const s = state({ first: 1, second: 2, third: 3 });
	const label = computed(() => s.first + s.second + s.third);

	<section>{label}<Small /></section>
}
`,
	);

	expect(errorCodes(compiled)).toEqual([]);
	expect(dependencyEdges(bindingOf(compiled, 'Large', 'label'))).toEqual([
		'state:s:first',
		'state:s:second',
		'state:s:third',
	]);
	expect(dependencyEdges(bindingOf(compiled, 'Small', 'label'))).toEqual(['state:s:tick']);
});

test('a shared-factory cell still reaches the sibling derives that read it', async () => {
	const compiled = await compileModule(
		'src/Widget.tsrx',
		`
import { computed, shared, state } from '@markless/core';

export const widget = shared(
	() => {
		const w = state({ theme: 'light' });
		return { ...w };
	},
	{ scope: 'widget' },
);

function Reader() @{
	const w = widget();
	const s = state({ tick: 0 });
	const label = computed(() => \`\${w.theme}|\${s.tick}\`);

	<div>{label}</div>
}

export default function Writer() @{
	const w = widget();
	const s = state({ beat: 0 });
	const label = computed(() => \`\${w.theme}|\${s.beat}\`);

	<section>{label}<Reader /></section>
}
`,
	);

	expect(errorCodes(compiled)).toEqual([]);
	expect(dependencyEdges(bindingOf(compiled, 'Reader', 'label'))).toEqual([
		'shared:src/Widget.tsrx#widget/state:w:theme',
		'state:s:tick',
	]);
	expect(dependencyEdges(bindingOf(compiled, 'Writer', 'label'))).toEqual([
		'shared:src/Widget.tsrx#widget/state:w:theme',
		'state:s:beat',
	]);
});

test('a derive chained onto a sibling-named derive stays inside its own part', async () => {
	const compiled = await compileModule(
		'src/Chained.tsrx',
		`
import { computed, state } from '@markless/core';

function Reader() @{
	const s = state({ tick: 0 });
	const label = computed(() => \`\${s.tick}\`);
	const shout = computed(() => \`\${label}!\`);

	<div>{shout}</div>
}

export default function Writer() @{
	const s = state({ beat: 0 });
	const label = computed(() => \`\${s.beat}\`);

	<section>{label}<Reader /></section>
}
`,
	);

	expect(errorCodes(compiled)).toEqual([]);
	expect(dependencyEdges(bindingOf(compiled, 'Reader', 'shout'))).toEqual(['computed:label:']);
	expect(dependencyEdges(bindingOf(compiled, 'Writer', 'label'))).toEqual(['state:s:beat']);
	expect(dependencyEdges(bindingOf(compiled, 'Reader', 'label'))).toEqual(['state:s:tick']);
});
