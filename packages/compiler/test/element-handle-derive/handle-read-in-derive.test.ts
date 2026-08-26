import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

/**
 * A `computed()` body that reads an element() handle used to compile and then
 * read `undefined` on every derivation, CSR and SSR resume alike: handles are
 * bound on the DOM, and only a handler-shaped read is rewritten into the lookup
 * that answers one. The compiler refuses the read instead.
 */

const CODE = 'MARKLESS_ELEMENT_HANDLE_UNBOUND';

async function compile(filename: string, source: string) {
	return compileTsrxModule({ filename, source, symbols: [] });
}

function refusals(result: Awaited<ReturnType<typeof compile>>) {
	return result.semanticGraph.diagnostics.filter(
		(diagnostic) => diagnostic.code === CODE && diagnostic.severity === 'error',
	);
}

test('a singular handle read in a part computed is refused by name', async () => {
	const result = await compile(
		'src/Single.tsrx',
		`
import { computed, element, state } from '@markless/core';

export default function SingleRoot() @{
	const s = state({ tick: 0 });
	const boxEl = element<HTMLDivElement>();
	const derived = computed(() => \`\${s.tick}|\${boxEl}\`);

	<div data-derived={derived} el={boxEl}>box</div>
}
`,
	);

	const [refusal, ...rest] = refusals(result);
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('"boxEl"');
	expect(refusal?.message).toContain('"derived"');
	expect(refusal?.message).toContain('SingleRoot');
	expect(refusal?.message).toContain(
		'element() handles are DOM-bound and readable only in event handlers',
	);
});

test('a plural handle read in a part computed is refused', async () => {
	const result = await compile(
		'src/Plural.tsrx',
		`
import { computed, element, shared, state } from '@markless/core';

export const plural = shared(
	() => {
		const s = state({ tick: 0 });
		const itemEls = element<HTMLDivElement[]>();
		return { ...s, itemEls };
	},
	{ scope: 'widget' },
);

export function PluralRoot({ children }) @{
	const s = plural();
	const derived = computed(() => \`\${s.tick}|\${s.itemEls}\`);

	<div data-derived={derived}>{children}</div>
}

export function PluralItem({ value }) @{
	const s = plural();

	<div el={s.itemEls}>{value}</div>
}
`,
	);

	const [refusal, ...rest] = refusals(result);
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('"s.itemEls"');
	expect(refusal?.message).toContain('PluralRoot');
});

test('a handle read in a shared factory computed is refused and names the factory', async () => {
	const result = await compile(
		'src/Factory.tsrx',
		`
import { computed, element, shared, state } from '@markless/core';

export const factory = shared(
	() => {
		const s = state({ tick: 0 });
		const itemEls = element<HTMLDivElement[]>();
		const shownCount = computed(() => \`\${s.tick}|\${itemEls}\`);
		return { ...s, itemEls, shownCount };
	},
	{ scope: 'widget' },
);

export function FactoryItem({ value }) @{
	const s = factory();

	<div el={s.itemEls}>{value}</div>
}
`,
	);

	const [refusal, ...rest] = refusals(result);
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('"itemEls"');
	expect(refusal?.message).toContain('"shownCount"');
	expect(refusal?.message).toContain('factory');
});

test('the same read in an event handler still compiles', async () => {
	const result = await compile(
		'src/Handler.tsrx',
		`
import { element, state } from '@markless/core';

export default function Probe() @{
	const s = state({ probed: '' });
	const trackEl = element<HTMLDivElement>();

	<div el={trackEl}>
		<button
			type="button"
			onClick={() => {
				s.probed = String(trackEl?.getBoundingClientRect().width);
			}}
		>probe</button>
	</div>
}
`,
	);

	expect(result.semanticGraph.diagnostics).toEqual([]);
});

test('a computed that only reads a state cell beside a handle still compiles', async () => {
	const result = await compile(
		'src/StateOnly.tsrx',
		`
import { computed, element, state } from '@markless/core';

export default function Gauge() @{
	const s = state({ measuring: false, width: 'idle' });
	const trackEl = element<HTMLDivElement>();
	const label = computed(() => (s.measuring ? s.width : 'idle'));

	<div data-label={label} el={trackEl} onClick={() => (s.measuring = true)}>gauge</div>
}
`,
	);

	expect(result.semanticGraph.diagnostics).toEqual([]);
});

/**
 * The scoping the refusal inherits: two same-module parts declare a handle and a
 * derive of the same names, and only the part whose derive reads the handle is
 * named. A module-wide name map would report both.
 */
test('the refusal names the declaring component under same-module sibling parts', async () => {
	const result = await compile(
		'src/Siblings.tsrx',
		`
import { computed, element, state } from '@markless/core';

function Reader() @{
	const s = state({ tick: 0 });
	const boxEl = element<HTMLDivElement>();
	const label = computed(() => \`\${s.tick}|\${boxEl}\`);

	<div data-label={label} el={boxEl}>reader</div>
}

export default function Writer() @{
	const s = state({ tick: 0 });
	const boxEl = element<HTMLDivElement>();
	const label = computed(() => \`\${s.tick}|ok\`);

	<section data-label={label}>
		<div el={boxEl} onClick={() => (s.tick = s.tick + 1)}>writer</div>
		<Reader />
	</section>
}
`,
	);

	const [refusal, ...rest] = refusals(result);
	expect(rest).toEqual([]);
	expect(refusal?.message).toContain('in Reader');
	expect(refusal?.message).not.toContain('in Writer');
});
