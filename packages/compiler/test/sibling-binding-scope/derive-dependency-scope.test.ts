import { expect, test } from 'vitest';
import { bindingOf, compileModule, dependencyEdges, errorCodes } from './support.ts';

/**
 * Two parts in one module may each declare `state`, `element()` and `computed()`
 * under the same local name. Such a name mints `kind:Component.name`, so the two
 * parts carry two distinct wire keys, and every consumer of the id resolves the
 * name against the component that declared it; a module-wide lookup would keep
 * only whichever part came last and cross-wire the two.
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
	expect(dependencyEdges(bindingOf(compiled, 'Reader', 'label'))).toEqual([
		'state:Reader.s:tick',
	]);
	expect(dependencyEdges(bindingOf(compiled, 'Writer', 'label'))).toEqual([
		'state:Writer.s:beat',
	]);
});

test('each declaring component mints its own id for the shared local name', async () => {
	const compiled = await compileModule('src/Siblings.tsrx', SIBLINGS);

	expect(bindingOf(compiled, 'Reader', 's')?.id).toBe('state:Reader.s');
	expect(bindingOf(compiled, 'Writer', 's')?.id).toBe('state:Writer.s');
	expect(bindingOf(compiled, 'Reader', 'label')?.id).toBe('computed:Reader.label');
	expect(bindingOf(compiled, 'Writer', 'label')?.id).toBe('computed:Writer.label');
	expect(bindingOf(compiled, 'Reader', 'boxEl')?.id).toBe('element:Reader.boxEl');
	expect(bindingOf(compiled, 'Writer', 'boxEl')?.id).toBe('element:Writer.boxEl');
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
		'state:Large.s:first',
		'state:Large.s:second',
		'state:Large.s:third',
	]);
	expect(dependencyEdges(bindingOf(compiled, 'Small', 'label'))).toEqual([
		'state:Small.s:tick',
	]);
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
		'state:Reader.s:tick',
	]);
	expect(dependencyEdges(bindingOf(compiled, 'Writer', 'label'))).toEqual([
		'shared:src/Widget.tsrx#widget/state:w:theme',
		'state:Writer.s:beat',
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
	expect(dependencyEdges(bindingOf(compiled, 'Reader', 'shout'))).toEqual([
		'computed:Reader.label:',
	]);
	expect(dependencyEdges(bindingOf(compiled, 'Writer', 'label'))).toEqual([
		'state:Writer.s:beat',
	]);
	expect(dependencyEdges(bindingOf(compiled, 'Reader', 'label'))).toEqual([
		'state:Reader.s:tick',
	]);
});
