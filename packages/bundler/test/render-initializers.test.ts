import { expect, test } from 'vitest';
import { transformTsrxModule } from '../src/transform.ts';
import { renderPrerenderDataSurface } from '../../web/src/prerender/evaluator.ts';

test.each([
	{ name: 'Total', prop: 'amount', tag: 'output', factor: 2 },
	{ name: 'Distance', prop: 'length', tag: 'p', factor: 3 },
])(
	'render data carries $name initializers while its click handler stays lazy',
	async ({ name, prop, tag, factor }) => {
		const result = await transformTsrxModule({
			filename: `/workspace/${name}.tsrx`,
			environment: 'client',
			source: `import { state, computed } from '@markless/core';
export default function ${name}({ ${prop} }) @{
	let value = state(${prop});
	const total = computed(() => value * ${factor});
	<${tag} onClick={() => value++}>{total}</${tag}>
}`,
		});
		const renderData = result.virtualModules.find((module) => module.type === 'render-data')!;
		const handlers = result.manifest.symbols.filter(
			(symbol) => symbol.kind === 'event-handler',
		);
		for (const handler of handlers)
			expect(renderData.source).not.toContain(handler.virtualModuleId);
		const initializers = result.manifest.symbols.filter(
			(symbol) =>
				symbol.kind === 'state-initializer' || symbol.kind === 'sync-computed-derive',
		);
		expect(initializers.length).toBeGreaterThan(0);
		for (const initializer of initializers)
			expect(renderData.source).toContain(initializer.virtualModuleId);
		const moduleUrl = (source: string) =>
			`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
		let source = renderData.source;
		for (const initializer of initializers) {
			const module = result.virtualModules.find(
				(module) => module.id === initializer.virtualModuleId,
			)!;
			source = source.replace(
				JSON.stringify(module.id),
				JSON.stringify(moduleUrl(module.source)),
			);
		}
		const { marklessPrerenderData } = await import(moduleUrl(source));
		for (const value of [4, 7]) {
			const output = await renderPrerenderDataSurface(
				marklessPrerenderData,
				(id) => {
					throw new Error(`Unexpected render-time symbol request: ${id}`);
				},
				{ [prop]: value },
			);
			expect(output.html).toContain(`>${value * factor}</${tag}>`);
		}
	},
);
