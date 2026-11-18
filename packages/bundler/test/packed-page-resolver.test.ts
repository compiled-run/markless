import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

// A page's own resolver is loaded by its @try's update symbol, so a packed build has to see the imports it routes
// through: an import the bundler cannot see loses its symbol's export when the symbol's module joins a pack.
test('a packed page resolver imports each of its symbols where the bundler sees them', async () => {
	const result = await transformTsrxModule({
		filename: '/workspace/pages/index.tsrx',
		source: `
import { computed } from '@markless/core';
import Tabs from '../src/tabs.tsrx';

export default function Page() @{
	const items = computed(async () => ['x', 'y']);
	<main>
		@try {
			<Tabs items={items} />
		} @pending {
			<p>loading</p>
		}
	</main>
}
`,
		environment: 'client',
		experimentalNativePacking: true,
	});

	const resolver = result.virtualModules.find((module) => module.type === 'resolver');
	const symbols = result.manifest.symbols;
	expect(symbols.length).toBeGreaterThan(0);
	expect(resolver?.source).not.toContain('@vite-ignore');
	for (const symbol of symbols)
		expect(resolver?.source).toContain(`import(${JSON.stringify(symbol.virtualModuleId)})`);
});
