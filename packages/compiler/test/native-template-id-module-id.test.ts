import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

test('native template ids spell the module id, not the checkout path', async () => {
	const result = await compileTsrxModule({
		filename: '/checkout/app/src/Counter.tsrx',
		moduleId: 'src/Counter.tsrx',
		source: `import { state } from '@markless/core';
export function Counter() @{
	let count = state(0);
	<button onClick={() => count++}>{count}</button>
}`,
		symbols: [],
	});
	const ids = result.publicRenderModule.componentDefinitions.flatMap((definition) =>
		(
			definition as { readonly chunks: ReadonlyArray<{ readonly nativeTemplateId: string }> }
		).chunks.map((chunk) => chunk.nativeTemplateId),
	);
	expect(ids.length).toBeGreaterThan(0);
	for (const id of ids)
		expect(id).toMatch(/^markless-render-data:src%2FCounter\.tsrx:Counter:template:/);
});
