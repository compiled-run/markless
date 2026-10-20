import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

test('xlink:, xml: and xmlns: attributes reach the markup, static and bound', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Icon.tsrx',
		source: `import { state } from '@markless/core';
export function Icon() @{
	let target = state('#dot');
	<svg xmlns:xlink="http://www.w3.org/1999/xlink">
		<use xlink:href="#dot" href="#dot" />
		<use xlink:href={target} />
		<text xml:space="preserve">{'a  b'}</text>
	</svg>
}
`,
		symbols: [],
	});
	const template = result.semanticGraph.markup.chunks.find((chunk) => chunk.kind === 'template')!;
	const statics = template.statics.join('');
	expect(statics).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
	expect(statics).toContain('<use xlink:href="#dot" href="#dot">');
	expect(statics).toContain('xml:space="preserve"');
	expect(template.slots).toContainEqual(
		expect.objectContaining({ kind: 'attribute', name: 'xlink:href' }),
	);
});
