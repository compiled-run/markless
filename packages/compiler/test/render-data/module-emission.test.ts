import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/compile-module.ts';

test('public render emission owns render facts in one canonical module export', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { state } from '@markless/core';
export function App() @{ let count = state(1); <button>{count}</button> }`,
		symbols: [],
	});

	const renderData = JSON.stringify(result.renderData);
	expect(result.publicRenderModule.renderDataModuleSource).toContain(renderData);
	expect(result.publicRenderModule.ssrModuleSource).not.toContain(renderData);
	expect(result.publicRenderModule.ssrModuleSource).toContain('marklessRenderData');
});
