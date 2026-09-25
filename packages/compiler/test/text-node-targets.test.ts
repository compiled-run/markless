import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A text hole that shares its element with other children writes one child text
// node, located by position among the host's child nodes; a hole alone in its
// element keeps the whole-element write and ships no position.
async function textTargets(markup: string) {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { state } from '@markless/core';
function Icon() @{
	<i>+</i>
}
export default function Page() @{
	let count = state(0);
	let other = state('');
	<main>${markup}<button onClick={() => { count++; other = 'x'; }}>go</button></main>
}
`,
		symbols: [],
	});
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result.protocolView.domUpdates
		.filter((update) => update.target?.kind === 'text')
		.map((update) => update.target);
}

test('a hole alone in its element ships no text-node position', async () => {
	expect(await textTargets('<p>{count}</p><p>n={count}!</p>')).toEqual([
		{ kind: 'text' },
		{ kind: 'text', prefix: 'n=', suffix: '!' },
	]);
});

test('a hole beside elements counts the static nodes in front of it', async () => {
	expect(
		await textTargets(
			'<p>{count}<b>!</b></p><p><i>*</i>{count}</p><p>a<b /> n={count}<u />tail</p>',
		),
	).toEqual([
		{ kind: 'text', textNode: 0 },
		{ kind: 'text', textNode: 1 },
		{ kind: 'text', prefix: ' n=', textNode: 2 },
	]);
});

test('a hole after a component counts back from the end instead', async () => {
	expect(await textTargets('<p><Icon />{count}<b>.</b></p><p><Icon />{count}</p>')).toEqual([
		{ kind: 'text', textNode: -2 },
		{ kind: 'text', textNode: -1 },
	]);
});

test('a hole with a render-sized sibling on each side keeps the whole-element write', async () => {
	expect(await textTargets('<p><Icon />{count}<Icon /></p>')).toEqual([{ kind: 'text' }]);
});

test('the emitted update names its text node', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { state } from '@markless/core';
export default function Page() @{
	let count = state(0);
	<p>{count}<b>!</b><button onClick={() => count++}>go</button></p>
}
`,
		symbols: [],
	});
	const update = result.protocolView.domUpdates.find((entry) => entry.target?.kind === 'text');
	const module = result.symbolModules.modules.find(
		(entry) => entry.symbolId === update?.symbolId,
	);
	expect(module?.source).toMatch(/marklessTextNode\(host, 0\)/);
	expect(module?.source).toContain('@markless/web/fns/text-node');
});

test('several holes sharing one text node beside elements update as one joined text', async () => {
	expect(await textTargets('<p>{count} and {other}<b>!</b></p>')).toEqual([
		{ kind: 'text', textNode: 0 },
	]);
	expect(await textTargets('<p><Icon />[{count}/{other}]</p>')).toEqual([
		{ kind: 'text', textNode: -1 },
	]);
});
