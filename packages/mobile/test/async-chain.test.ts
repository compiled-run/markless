import { describe, expect, it } from 'vitest';
import { compileNativeComponent } from '../src/index.ts';

// An async value that reads another waits for it, as on the web.

describe('an async value that reads another', () => {
	it('builds, binds the other as a cell and runs it wherever the reader is shown', async () => {
		const { payload, diagnostics } = await compileNativeComponent({
			filename: 'app/App.tsrx',
			source: `import { computed, state } from '@markless/core';
async function level(n: number, version: number) {
	return { version: version + n };
}
export default function App() @{
	let version = state(0);
	const first = computed(async () => level(1, version));
	const second = computed(async () => level(10, first.version));
	<main>
		<button onClick={() => (version = version + 1)}>Bump</button>
		@try { <p>{second.version}</p> } @pending { <p>Waiting</p> } @catch { <p>Failed</p> }
	</main>
}
`,
		});
		expect(diagnostics).toEqual([]);
		const tasks = payload!.cells.filter((cell) => cell.async);
		expect(tasks.map((cell) => cell.name).sort()).toEqual(['first', 'second']);
		const [first, second] = ['first', 'second'].map((name) =>
			tasks.find((cell) => cell.name === name)!,
		);
		expect(second.async!.bindings).toEqual({ first: { cell: first.id } });
		expect(first.async!.boundaries).toEqual(second.async!.boundaries);
		expect(payload!.script!.source).toContain('__s = __settled(__s, ["first"]);');
	});
});
