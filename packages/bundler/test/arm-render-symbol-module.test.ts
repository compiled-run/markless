import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';

// Settled arms remain canonical render-data chunks while only the async runner
// is demand-loaded. The retired public CSR producer must not return as a second
// copy of the same component definition.
test('settled arms stay in render data and only their runner is demand-loadable', async () => {
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

	expect(result.manifest.symbols.some((symbol) => symbol.kind === 'async-boundary-update')).toBe(
		false,
	);
	const renderData = result.virtualModules.find((module) => module.type === 'render-data');
	expect(renderData?.source).toContain('"id":"async:boundary:0:arm:try"');
	expect(renderData?.source).toContain('"id":"async:boundary:0:arm:pending"');
	expect(renderData?.source).toContain('"id":"async:boundary:0:arm:catch"');
	const runner = result.manifest.symbols.find(
		(symbol) => symbol.kind === 'async-computed-runner',
	);
	expect(runner).toBeDefined();
	const resolver = result.virtualModules.find((module) => module.type === 'resolver');
	expect(resolver?.source).toContain(`import(/* @vite-ignore */ "${runner!.virtualModuleId}")`);
	expect(result.code).toContain('import("./shell.tsrx?markless-symbols")');
	expect(result.code).not.toContain('from "@markless/web/fns/csr"');
	expect(result.code).not.toContain('createMarklessCsrChunkRenderer');
});

test('linked render-data resolvers cover component boundary commits', async () => {
	const child = await transformTsrxModule({
		filename: '/workspace/app/src/Badge.tsrx',
		source: `export function Badge({ label }) @{ <em>{label}</em> }`,
		environment: 'client',
	});
	const result = await transformTsrxModule({
		filename: '/workspace/app/src/Report.tsrx',
		source: `
import { computed } from '@markless/core';
import { Badge } from './Badge.tsrx';

export default function Report() @{
	const report = computed(async () => ({ title: 'Ready' }));
	<main>
		@try { <Badge label={report.title} /> }
		@pending { <p>Loading</p> }
		@catch { <p>Broken</p> }
	</main>
}
`,
		environment: 'client',
		importedModuleInterfaces: {
			'./Badge.tsrx': child.moduleGraphInterface,
		},
	});

	const boundary = result.manifest.symbols.find(
		(symbol) => symbol.kind === 'async-boundary-update',
	);
	expect(boundary).toBeDefined();
	const resolver = result.virtualModules.find((module) => module.type === 'resolver');
	expect(resolver?.source).toContain(boundary!.virtualModuleId);
	const boundaryModule = result.virtualModules.find(
		(module) => module.type === 'symbol' && module.symbolId === boundary!.symbolId,
	);
	expect(boundaryModule?.source).toContain('renderPrerenderBoundary');
	expect(boundaryModule?.source).toContain('marklessPrerenderData');
});
