import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A component whose own children are written inside a child it composes: the
// consumer's parts render BEFORE that child is composed, so the seed phase has
// to hand the composed child its props, and the derives those props read have
// to run there too. Without that, the parts render from the factory placeholder
// while the component's own markup renders from what the body seeded, and one
// server render answers the same question two ways.
const composedSource = `
import { shared, state } from '@markless/core';
import { Inner } from './inner.tsrx';

export const gate = shared(() => {
	const cell = state({ picked: [] });

	return { ...cell };
}, { scope: 'widget' });

export function Row({ option, children }) @{
	const cell = gate();
	const row = state({ option });

	<Inner on={cell.picked.includes(row.option)}>{children}</Inner>
}
`;

async function compile(filename: string, source: string) {
	return compileTsrxModule({
		filename,
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

/** The `marklessSharedSeeds` early-return block of one emitted SSR function. */
function seedPassOf(source: string, functionName: string): string {
	const start = source.indexOf(`async function ${functionName}(`);
	if (start < 0) return '';
	const guard = source.indexOf('marklessSharedSeeds', start);
	const end = source.indexOf('return;', start);
	return guard < 0 || end < 0 ? '' : source.slice(guard, end);
}

test('the seed phase hands the composed children-root the props the render hands it', async () => {
	const compiled = await compile('src/gate.tsrx', composedSource);
	const seedPass = seedPassOf(compiled.publicRenderModule.ssrModuleSource ?? '', 'marklessRenderSsr');

	expect(seedPass).toMatch(/on:marklessSsrReadPublicPath\(marklessSsrRenderStateValues\.get\(/);
	expect(seedPass).toContain('marklessSsrSeedChild(');
});

test('a template expression over shared state handed only to a composed child is derived during SSR', async () => {
	const compiled = await compile('src/gate.tsrx', composedSource);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	const propRead = source.match(
		/on:marklessSsrReadPublicPath\(marklessSsrRenderStateValues\.get\("(computed:templateExpression:\d+)"\)/,
	);

	expect(propRead?.[1]).toBeDefined();
	// The derive itself, not the inert `typeof local !== 'undefined'` guard: the
	// composing body declares no local for an expression only the child reads.
	expect(source).toContain(
		`marklessSsrRenderStateValues.set(${JSON.stringify(propRead?.[1] ?? '')},(({read})=>`,
	);
});

// Two parts of one page may each compose a root of the SAME family. Unless the
// composing component declares the families its composed root starts, an outer
// seed phase walks into a sibling that composes its own instance and the last
// one written wins for every part in that scope.
test('a component that composes a widget root around its children declares that root families', async () => {
	const compiled = await compile('src/gate.tsrx', composedSource);

	expect(compiled.publicRenderModule.ssrModuleSource).toMatch(
		/marklessRenderSsr\.marklessWidgetRoots = \[[^\]]*\.\.\.marklessSsrWidgetRoots\(/,
	);
});

// Alternate shape: different family, cell, component, prop and attribute names,
// and the composed root takes two derived props rather than one.
test('an alternate-shaped composition seeds the same way', async () => {
	const compiled = await compile(
		'src/panel.tsrx',
		`
import { shared, state } from '@markless/core';
import { Frame } from './frame.tsrx';

export const board = shared(() => {
	const slots = state({ taken: [], locked: false });

	return { ...slots };
}, { scope: 'widget' });

export function Seat({ seat, children }) @{
	const slots = board();
	const here = state({ seat });

	<Frame active={slots.taken.includes(here.seat)} off={slots.locked}>{children}</Frame>
}
`,
	);
	const seedPass = seedPassOf(
		compiled.publicRenderModule.ssrModuleSource ?? '',
		'marklessRenderSsr',
	);

	expect(seedPass).toMatch(/active:marklessSsrReadPublicPath\(marklessSsrRenderStateValues\.get\(/);
	expect(seedPass).toMatch(/off:marklessSsrReadPublicPath\(marklessSsrRenderStateValues\.get\(/);
	expect(seedPass).toContain('marklessSsrSeedChild(');
});
