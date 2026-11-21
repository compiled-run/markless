import { describe, expect, it } from 'vitest';
import {
	createNativeViewPayload,
	NATIVE_FACT_COLLECTORS,
	type NativeViewOptions,
} from '../src/native.ts';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

const SOURCE = `import { shared, state } from '@markless/core';
const countState = shared(() => {
	const count = state({ taps: 0 });
	return { ...count, bump() { count.taps = count.taps + 1; } };
});
function Bumper() @{
	const count = countState();
	<button onClick={() => count.bump()}>Bump</button>
}
function Readout() @{
	const count = countState();
	<p>{count.taps}</p>
}
export function App() @{
	<main><Readout /><section><Bumper /></section><Readout /></main>
}`;

const nativeView = async (options: NativeViewOptions = {}) =>
	createNativeViewPayload(
		await buildSemanticGraph({
			filename: 'src/App.tsrx',
			source: SOURCE,
			nativeFacts: NATIVE_FACT_COLLECTORS,
		}),
		{
			readSource: (file) => (file === 'src/App.tsrx' ? SOURCE : undefined),
			...options,
		},
	);

describe('an app-wide shared()', () => {
	it('is one instance on a screen, which components that are not inside one another all join', async () => {
		const { payload, diagnostics } = await nativeView();
		expect(diagnostics).toEqual([]);
		const cells = payload!.cells.filter((cell) => cell.name === 'count.taps');
		expect(cells).toHaveLength(1);
		expect(cells[0]!.id.startsWith('app/')).toBe(true);
	});

	it('is refused by name in an app with pages, where each page would hold its own copy', async () => {
		const { payload, diagnostics } = await nativeView({
			routes: [{ pattern: '/', params: [] }],
			resolvePath: () => undefined,
		});
		expect(payload).toBeNull();
		expect(diagnostics.map((diagnostic) => diagnostic.message)).toContain(
			"countState: an app-wide shared() in an app with pages, which each page's screen would hold apart",
		);
	});
});
