import { expect, test } from 'vitest';
import { compileModule, errorCodes } from './support.ts';

/**
 * `element:boxEl` is minted from the local name alone, so two parts that each
 * declare `boxEl` and each bind it once are not a double bind. The exactly-one
 * rule is asked of the scope that DECLARED the handle - a component body, or the
 * shared factory it was written inside - not of the module.
 */

const DUPLICATE = 'MARKLESS_ELEMENT_HANDLE_DUPLICATE';

test('two parts each binding their own same-named handle is not a duplicate', async () => {
	const compiled = await compileModule(
		'src/Siblings.tsrx',
		`
import { element, state } from '@markless/core';

function Reader() @{
	const boxEl = element<HTMLDivElement>();

	<div el={boxEl}>reader</div>
}

export default function Writer() @{
	const s = state({ beat: 0 });
	const boxEl = element<HTMLDivElement>();

	<section>
		<div el={boxEl} onClick={() => (s.beat = s.beat + 1)}>writer</div>
		<Reader />
	</section>
}
`,
	);

	expect(errorCodes(compiled)).toEqual([]);
});

test('a handle bound twice inside one part is still refused', async () => {
	const compiled = await compileModule(
		'src/Solo.tsrx',
		`
import { element } from '@markless/core';

export default function Solo() @{
	const boxEl = element<HTMLDivElement>();

	<div>
		<div el={boxEl}>first</div>
		<div el={boxEl}>second</div>
	</div>
}
`,
	);

	expect(errorCodes(compiled)).toEqual([DUPLICATE]);
});

test('a handle bound twice in one part beside a same-named sibling handle is refused once', async () => {
	const compiled = await compileModule(
		'src/Mixed.tsrx',
		`
import { element } from '@markless/core';

function Reader() @{
	const boxEl = element<HTMLDivElement>();

	<div el={boxEl}>reader</div>
}

export default function Writer() @{
	const boxEl = element<HTMLDivElement>();

	<section>
		<div el={boxEl}>first</div>
		<div el={boxEl}>second</div>
		<Reader />
	</section>
}
`,
	);

	expect(errorCodes(compiled)).toEqual([DUPLICATE]);
});

test('a singular shared-factory handle bound by two parts of one widget is still refused', async () => {
	const compiled = await compileModule(
		'src/Widget.tsrx',
		`
import { element, shared, state } from '@markless/core';

export const widget = shared(
	() => {
		const w = state({ tick: 0 });
		const trackEl = element<HTMLDivElement>();
		return { ...w, trackEl };
	},
	{ scope: 'widget' },
);

export function WidgetRoot({ children }) @{
	const s = widget();

	<div el={s.trackEl}>{children}</div>
}

export function WidgetPart() @{
	const s = widget();

	<div el={s.trackEl}>part</div>
}
`,
	);

	expect(errorCodes(compiled)).toEqual([DUPLICATE]);
});

test('a plural shared-factory handle bound by two parts of one widget still compiles', async () => {
	const compiled = await compileModule(
		'src/PluralWidget.tsrx',
		`
import { element, shared, state } from '@markless/core';

export const widget = shared(
	() => {
		const w = state({ tick: 0 });
		const itemEls = element<HTMLDivElement[]>();
		return { ...w, itemEls };
	},
	{ scope: 'widget' },
);

export function WidgetRoot({ children }) @{
	const s = widget();

	<div>{children}</div>
}

export function WidgetItem({ value }) @{
	const s = widget();

	<div el={s.itemEls}>{value}</div>
}
`,
	);

	expect(errorCodes(compiled)).toEqual([]);
});
