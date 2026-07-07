import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

// Tier-4 arm-render symbol modules import child components and helper-catalog
// functions. The virtual-module pipeline must keep those imports intact and
// still apply the scoped export rename (the resolver dispatches on it), and
// the relative child import must resolve against the source .tsrx importer.
test('arm-render symbol virtual modules keep component imports and the scoped export rename', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/IssuesPage.tsrx',
		source: `
import { computed } from '@markless/core';
import { Shell } from './shell.tsrx';

export default function Page() @{
	const view = computed(async () => ({ title: 'Issues', repos: [{ id: 'a' }] }));
	<main>
		@try {
			<>
				<Shell title={view.title} />
				<ul class="rows">
					@for (const r of view.repos; key r.id) { <li class="row">{r.id}</li> }
				</ul>
			</>
		} @pending { <p>Loading</p> } @catch { <p>Broken</p> }
	</main>
}
`,
		environment: 'client',
	});

	const manifestEntry = result.manifest.symbols.find(
		(symbol) => symbol.kind === 'async-boundary-update',
	);
	expect(manifestEntry).toBeDefined();
	const virtualModule = result.virtualModules.find(
		(module) => module.type === 'symbol' && module.symbolId === manifestEntry!.symbolId,
	);
	expect(virtualModule).toBeDefined();
	// Scoped rename applied to the plain `export function` form.
	expect(virtualModule!.source).toContain(`export function ${manifestEntry!.exportName}(`);
	expect(manifestEntry!.exportName).toMatch(/_[0-9a-z]+$/);
	// Component + helper-catalog imports survive the virtual module pipeline.
	expect(virtualModule!.source).toContain('from "./shell.tsrx"');
	expect(virtualModule!.source).toMatch(/from ["']@markless\/web\/fns\/csr["']/);
	// The boundary record dispatches to this module at settle time.
	const payloadModule = result.virtualModules.find((module) => module.type === 'payload');
	expect(payloadModule!.source).toContain(`"updateSymbolId": "${manifestEntry!.symbolId}"`);
});
