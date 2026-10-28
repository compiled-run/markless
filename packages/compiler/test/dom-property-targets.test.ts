import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

test('members with no live attribute bind as properties, and default* members write the attribute they reflect', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Members.tsrx',
		symbols: [],
		source: `import { state } from '@markless/core';
export function Members() @{
	let n = state(0);
	<main>
		<input type="checkbox" indeterminate={n === 1} checked={n === 2} defaultChecked={n === 3} />
		<input value={String(n)} defaultValue={String(n)} />
		<video muted={n === 0} volume={n / 10} currentTime={n} playbackRate={n} defaultMuted={n === 4} />
		<div scrollTop={n} scrollLeft={n} title={String(n)} />
		<button onClick={() => (n = n + 1)}>next</button>
	</main>
}
`,
	});
	expect(result.protocolView.domUpdates.map((update) => update.target)).toEqual([
		{ kind: 'property', name: 'indeterminate' },
		{ kind: 'property', name: 'checked' },
		{ kind: 'attribute', name: 'checked' },
		{ kind: 'property', name: 'value' },
		{ kind: 'attribute', name: 'value' },
		{ kind: 'property', name: 'muted' },
		{ kind: 'property', name: 'volume' },
		{ kind: 'property', name: 'currentTime' },
		{ kind: 'property', name: 'playbackRate' },
		{ kind: 'attribute', name: 'muted' },
		{ kind: 'property', name: 'scrollTop' },
		{ kind: 'property', name: 'scrollLeft' },
		{ kind: 'attribute', name: 'title' },
	]);
	const markup = result.semanticGraph.markup.chunks
		.map((chunk) => chunk.statics.join(''))
		.join('');
	expect(markup).not.toMatch(/default(?:value|checked|muted)/i);
});
