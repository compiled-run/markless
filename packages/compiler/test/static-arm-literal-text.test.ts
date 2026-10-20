import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

function compile(source: string) {
	return compileTsrxModule({ filename: '/workspace/app/src/Tabs.tsrx', source, symbols: [] });
}

function panel(name: string, rows: number): string {
	const items = Array.from(
		{ length: rows },
		(_, row) =>
			`<li class="row-${row}"><code>{"${name} {${row}} <b>"}</code><span>{\`${name}-${row}\`}</span>{${row}}</li>`,
	).join('');
	return `<section data-panel="${name}"><ul>${items}</ul></section>`;
}

const tabsSource = (rows: number) => `
import { state } from '@markless/core';

export default function Tabs() @{
	let tab = state('one');

	<main>
		<button data-one onClick={() => (tab = 'one')}>one</button>
		<button data-two onClick={() => (tab = 'two')}>two</button>
		@if (tab === 'one') {
			${panel('one', rows)}
		} @else {
			${panel('two', rows)}
		}
	</main>
}
`;

test('literal text containers inside an @if arm are static text, not bindings', async () => {
	const result = await compile(tabsSource(3));

	expect(result.symbolModules.diagnostics).toEqual([]);
	const arms = result.renderData.chunks.filter((chunk) => chunk.kind === 'branch-arm');
	expect(arms).toHaveLength(2);
	for (const arm of arms) expect(arm.slots).toEqual([]);
	expect(arms[0]!.statics.join('')).toContain(
		'<code>one {0} &lt;b&gt;</code><span>one-0</span>0</li>',
	);
});

test('a captured static arm of thousands of elements compiles with no host records', async () => {
	const result = await compile(tabsSource(1500));

	expect(result.symbolModules.diagnostics).toEqual([]);
	const arms = result.renderData.chunks.filter((chunk) => chunk.kind === 'branch-arm');
	expect(arms.map((arm) => arm.slots)).toEqual([[], []]);
	const served = result.publicRenderModule.renderDataModuleSource;
	expect(served).toContain('inertElements');
	expect(served.match(/hostNodeId/g)?.length ?? 0).toBeLessThan(10);
	expect(JSON.stringify(result.protocolView).match(/hostNodeId/g)?.length ?? 0).toBeLessThan(10);
});
