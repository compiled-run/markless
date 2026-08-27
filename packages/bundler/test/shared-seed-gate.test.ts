import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

// The pay-per-use gate on the shared-seed pass. It used to ask one question —
// did this module plan a `shared-seed` symbol — and a widget-scoped family of
// element() handles over CONSTANT state plans none, so the pass never
// installed, no widget-instance token was ever filed, and the first CSR mint
// threw MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING while SSR's own marker
// answered. The gate now also asks whether this module ROOTS a widget, which is
// the compiler's `widgetRootComponents` answer republished as `rootsWidget`.
//
// Both halves are pinned here: the pass must still stay off for a module that
// needs nothing from it, and the record the gate reads must never reach the
// payload.

const INSTALL_IMPORT =
	"import { installMarklessSharedSeedPass } from '@markless/web/fns/shared-seed';";
const INSTALL_CALL = 'installMarklessSharedSeedPass();';

// A page-scoped `shared()` is not `scope: 'widget'`, so it roots no widget and
// nothing here can mint a widget-instance id. This is the zero-cost shape.
const NO_WIDGET_SOURCE = `
import { shared, state } from '@markless/core';

export const zcTheme = shared(() => {
	const theme = state({ tone: 'calm' });

	return theme;
});

export function ZcBadge({ label }) @{
	const theme = zcTheme();

	<span data-zc-badge data-tone={theme.tone}>{label}</span>
}

export default function ZcPage() @{
	const theme = zcTheme();

	<main data-zc-page>
		<ZcBadge label={theme.tone} />
	</main>
}
`;

// The defect shape: widget scope, an element() handle, and state whose only
// initial is a constant — so the compiler plans no shared-seed symbol at all.
const WIDGET_ROOT_SOURCE = `
import { element, shared, state } from '@markless/core';

export const wgField = shared(
	() => {
		const s = state({ hit: '' });
		const inputEl = element<HTMLInputElement>();

		return { ...s, inputEl };
	},
	{ scope: 'widget' },
);

export function WgRoot({ children }) @{
	const field = wgField();

	<div data-wg-root data-hit={field.hit}>{children}</div>
}

export function WgInput() @{
	const field = wgField();

	<input data-wg-input el={field.inputEl} />
}

export default function WgPage() @{
	<section>
		<WgRoot>
			<WgInput />
		</WgRoot>
	</section>
}
`;

async function renderDataSource(name: string, source: string): Promise<string> {
	const result = await transformTsrxModule({
		filename: `/workspace/app/src/${name}.tsrx`,
		source,
		environment: 'client',
	});
	const renderData = result.virtualModules.find((module) => module.type === 'render-data');
	if (!renderData) throw new Error(`No render-data module for ${name}.`);
	return renderData.source;
}

// Byte-identity, the same way `rolldown.test.ts` pins the resume emission: a
// module that needs nothing from the pass pays nothing for it, and any byte the
// gate ever starts adding here shows up as a snapshot diff. The snapshot was
// re-taken when `MARKLESS_SHARED_RETURN_UNNAMED` forced the fixture's factory to
// name its cell before returning it; the three assertions above it, not the byte
// count, are what say the gate stayed off.
test('a module that roots no widget keeps its render-data emission byte-identical', async () => {
	const source = await renderDataSource('zeroCost', NO_WIDGET_SOURCE);

	expect(source).not.toContain(INSTALL_IMPORT);
	expect(source).not.toContain(INSTALL_CALL);
	// The gate answer is build-time only; the record the payload carries must not
	// grow a field for it.
	expect(source).not.toContain('rootsWidget');
	expect(source).toMatchSnapshot('render-data module for a module with no widget root');
});

// The row the widening exists for. Its seedless family is what the old gate
// could not see, and the install is all the module pays: the render data either
// side of the two-line prelude is what it was before.
test('a widget-scoped element() family with no planned seed still installs the pass', async () => {
	const source = await renderDataSource('widgetRoot', WIDGET_ROOT_SOURCE);
	const [importLine, callLine, ...rest] = source.split('\n');
	const payload = rest.join('\n');

	expect(importLine).toBe(INSTALL_IMPORT);
	expect(callLine).toBe(INSTALL_CALL);
	// The old gate's own question, asked of this module: it answers no, which is
	// why gating on seeds alone left the token unfiled.
	expect(payload).not.toContain('"shared-seed"');
	// Whatever else the gate reads, the payload carries none of it.
	expect(payload).not.toContain('rootsWidget');
	expect(payload).not.toContain('installMarklessSharedSeedPass');
});
