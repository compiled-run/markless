import { expect, test } from 'vitest';
import { marklessClient } from '../src/rolldown.ts';
import { callBuildStart, callLoad, callTransform } from './helpers.ts';

const INSTALL_LINE = 'installMarklessSharedSeedPass();';

async function renderDataModuleFor(source: string, filename: string) {
	const plugin = marklessClient();
	callBuildStart(plugin, { cwd: '/workspace/app' });
	await callTransform(plugin, source, filename);
	return (await callLoad(
		plugin,
		`\0virtual:markless:render-data:${encodeURIComponent(filename)}`,
	)) as string;
}

// A widget family whose members are constant state and an element() handle plans
// no shared-seed symbol, so the seed-kind gate alone never installed the pass -
// and the pass is what files the widget-instance token every shared() handle
// spells its id from. The first mint then threw
// MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING on CSR.
test('a seedless widget family that mints a shared handle id still installs the token pass', async () => {
	const code = await renderDataModuleFor(
		`import { element, shared } from '@markless/core';

export const wtField = shared(() => {
	const fieldEl = element<HTMLInputElement>();
	return { fieldEl };
}, { scope: 'widget' });

export function WtItem({ children }) @{
	const item = wtField();

	<div>{children}</div>
}

export function WtField() @{
	const item = wtField();

	<input el={item.fieldEl} />
}

export default function WtLabel() @{
	const item = wtField();

	<label for={item.fieldEl}>Name</label>
}`,
		'/workspace/app/src/WidgetTokens.tsrx',
	);

	expect(code).not.toContain("'shared-seed'");
	expect(code).toContain(INSTALL_LINE);
});

// The other half of the pay-per-use gate: a module that spells no shared() handle
// id needs no token, so it must not pull the pass into its chunk.
test('a module with no shared element handle keeps paying zero for the token pass', async () => {
	const code = await renderDataModuleFor(
		`import { state } from '@markless/core';

export default function WtCounter() @{
	const count = state(0);

	<button onClick={() => count++}>{count}</button>
}`,
		'/workspace/app/src/WidgetTokensFree.tsrx',
	);

	expect(code).not.toContain(INSTALL_LINE);
});
