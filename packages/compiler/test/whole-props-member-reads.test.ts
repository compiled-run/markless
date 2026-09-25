// `function Layout(props)` reading props by name compiles like destructured props.
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function compile(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Layout.tsrx', source, symbols: [] });
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result;
}

function emitted(result: Awaited<ReturnType<typeof compile>>) {
	return {
		chunks: result.renderData.chunks.map((chunk) => ({ statics: chunk.statics, slots: chunk.slots })),
		modules: result.symbolModules.modules.map((module) => module.source),
		routes: result.captureAnalysis.extractedSymbols.map((symbol) =>
			symbol.captureSlots.map((slot) => ({ propName: slot.propName, routes: slot.routes })),
		),
	};
}

const MEMBER_READS = `function Shell(props) @{
	<div class="shell">{props.children}</div>
}

export default function Layout(props) @{
	<section class="frame" title={props.title}>
		<Shell>{props.children}</Shell>
	</section>
}`;

const DESTRUCTURED = `function Shell({ children }) @{
	<div class="shell">{children}</div>
}

export default function Layout({ title, children }) @{
	<section class="frame" title={title}>
		<Shell>{children}</Shell>
	</section>
}`;

test('props.children and props.title compile like the destructured props', async () => {
	const members = await compile(MEMBER_READS);
	expect(members.captureAnalysis.diagnostics).toEqual([]);
	expect(emitted(members)).toEqual(emitted(await compile(DESTRUCTURED)));
});

// The same shape under other names: a callback prop called from a handler and a
// state-backed prop, all through a parameter named `p`.
const ALTERNATE_MEMBERS = `import { state } from '@markless/core';

export default function Board() @{
	let hits = state(1);
	<main>
		<Tile heading="Hits" count={hits} onBump={() => { hits = hits + 1; }}>
			<p>body</p>
		</Tile>
	</main>
}

function Tile(p) @{
	<article>
		<h2>{p.heading}</h2>
		<button type="button" onClick={() => p.onBump()}>{p.count}</button>
		{p.children}
	</article>
}`;

const ALTERNATE_DESTRUCTURED = `import { state } from '@markless/core';

export default function Board() @{
	let hits = state(1);
	<main>
		<Tile heading="Hits" count={hits} onBump={() => { hits = hits + 1; }}>
			<p>body</p>
		</Tile>
	</main>
}

function Tile({ heading, count, onBump, children }) @{
	<article>
		<h2>{heading}</h2>
		<button type="button" onClick={() => onBump()}>{count}</button>
		{children}
	</article>
}`;

test('alternate shape: callback props and state props through a parameter named p', async () => {
	const members = await compile(ALTERNATE_MEMBERS);
	expect(members.captureAnalysis.diagnostics).toEqual([]);
	const destructured = await compile(ALTERNATE_DESTRUCTURED);
	expect(emitted(members).chunks).toEqual(emitted(destructured).chunks);
	expect(emitted(members).routes).toEqual(emitted(destructured).routes);
});

test('a string-keyed bracket read routes the prop it names', async () => {
	const result = await compile(`export default function Tag(p) @{
	<b title={p['label']}>{p.children}</b>
}`);
	expect(result.captureAnalysis.diagnostics).toEqual([]);
	const label = result.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.source === "p['label']",
	);
	expect(label?.captureSlots.map((slot) => slot.routes)).toEqual([
		[{ kind: 'graph-reference', graphNodeId: 'prop:props', path: ['label'] }],
	]);
});

test.each([
	[
		'passed on whole',
		`export default function Card(props) @{
	<article><button onClick={() => { console.log(JSON.stringify(props)); }}>go</button></article>
}`,
	],
	[
		'indexed with a runtime key',
		`import { state } from '@markless/core';
export default function Card(props) @{
	let key = state('title');
	<article><button onClick={() => { console.log(props[key]); }}>go</button></article>
}`,
	],
	[
		'destructured inside the handler',
		`export default function Card(props) @{
	<article><button onClick={() => { const { title } = props; console.log(title); }}>go</button></article>
}`,
	],
])('a whole-props use that hides which props it needs refuses the build: %s', async (_, source) => {
	const result = await compile(source);
	const diagnostic = result.captureAnalysis.diagnostics.find(
		(candidate) => candidate.code === 'MARKLESS_CAPTURE_OPAQUE_PROP',
	);
	expect(diagnostic?.severity).toBe('error');
	expect(diagnostic?.message).toContain('whole props object "props"');
	expect(diagnostic?.suggestions?.[0]?.message).toContain('props.title');
});
