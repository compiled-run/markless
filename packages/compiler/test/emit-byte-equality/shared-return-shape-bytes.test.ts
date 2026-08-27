import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

// A `shared()` factory's return IS its cell set, so returning the state object by
// name and returning a wrapper that spreads it are one module as far as emission
// is concerned. Both are compiled under one filename, which is what makes the
// node ids comparable: any difference left is a difference in what the return
// shape lowered to.

const family = (returned: string) => `
import { shared, state } from '@markless/core';

export const famState = shared(
	() => {
		const tones = state({ tone: 'plain', note: 'n' });
		return ${returned};
	},
	{ scope: 'widget' },
);

export function FamRoot({ children }) @{
	const fam = famState();
	<div data-fam-root data-fam-tone={fam.tone}>{children}</div>
}

export function FamNote() @{
	const fam = famState();
	<span data-fam-note>{fam.note}</span>
}
`;

const emitted = async (returned: string) => {
	const result = await compileTsrxModule({
		filename: '/app/fam/fam.tsrx',
		source: family(returned),
		symbols: [],
	});
	expect(result.semanticGraph.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
	return {
		renderDataModuleSource: result.publicRenderModule.renderDataModuleSource,
		ssrModuleSource: result.publicRenderModule.ssrModuleSource,
		publicRenderPlan: JSON.stringify(result.publicRenderPlan, null, 2),
		protocolState: JSON.stringify(result.protocolState, null, 2),
		protocolView: JSON.stringify(result.protocolView, null, 2),
	};
};

test('the direct return and the wrapper that spreads it emit the same bytes', async () => {
	expect(await emitted('tones')).toEqual(await emitted('{ ...tones }'));
});

test('the wrapper shape still carries its cells into the emitted render data', async () => {
	// The equality above would also hold if both shapes emitted nothing.
	const wrapped = await emitted('{ ...tones }');
	expect(wrapped.renderDataModuleSource).toContain('shared:/app/fam/fam.tsrx#famState/state:tones');
	expect(wrapped.renderDataModuleSource).not.toContain('fam.tone');
});
