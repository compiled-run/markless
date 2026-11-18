import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A handler cannot keep a body variable between clicks: the body runs only for the first render.
test('a body let that a handler replaces between clicks, such as an AbortController, fails the build', async () => {
	const result = await compileTsrxModule({
		filename: 'src/nickname.tsrx',
		omitAuthoredSource: true,
		symbols: [],
		source: `import { state } from '@markless/core';
import { saveNickname } from './nickname.ts';
export default function Nickname() @{
	let draft = state('');
	let latest: AbortController | undefined;
	<button
		onClick={async () => {
			latest?.abort();
			latest = new AbortController();
			await saveNickname(draft, latest.signal);
		}}
	>
		Save
	</button>
}
`,
	});
	const errors = [...result.semanticGraph.diagnostics, ...result.captureAnalysis.diagnostics]
		.filter((item) => item.severity === 'error')
		.map((item) => item.code);
	expect(errors).toEqual(['MARKLESS_HANDLER_READS_RENDER_LOCAL']);
});
