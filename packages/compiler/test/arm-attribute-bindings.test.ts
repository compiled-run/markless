import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const noteSource = (onOpen: string, afterField: string) => `
import { state } from '@markless/core';

export default function Note() @{
	let open = state(false);
	let draft = state('');

	<section>
		<button onClick={${onOpen}}>Toggle</button>
		@if (open) {
			<label>
				Your message
				<input value={draft} onInput={(event) => (draft = event.currentTarget.value)} />
			</label>
			${afterField}
		}
	</section>
}`;

async function compile(filename: string, source: string) {
	return compileTsrxModule({ filename, source, symbols: [] });
}

function branchModule(result: Awaited<ReturnType<typeof compile>>) {
	return result.symbolModules.modules.find((module) => module.kind === 'branch-update')?.source;
}

// The parser hands the first of several sibling elements in a block over as a
// statement; an arm that skipped it rebuilt without its first element.
test('an @if arm with several top-level elements keeps every one of them', async () => {
	const result = await compile(
		'src/Pair.tsrx',
		`
import { state } from '@markless/core';

export function Pair() @{
	let shown = state(true);
	<div>
		<button onClick={() => (shown = !shown)}>Flip</button>
		@if (shown) {
			<em>first</em>
			<strong>second</strong>
		}
	</div>
}`,
	);
	const arm = result.renderData?.chunks.find((chunk) => chunk.id.endsWith(':arm:0'));
	expect(arm?.statics.join('')).toBe('<em>first</em><strong>second</strong>');
	expect(branchModule(result)).toContain('<em>first</em><strong>second</strong>');
});

test('keeping and clearing a field inside an @if build the same way', async () => {
	const shapes = {
		kept: noteSource('() => (open = !open)', '<p>Draft: {draft}</p>'),
		clearedOnOpen: noteSource(
			"() => { if (!open) draft = ''; open = !open; }",
			'<p>Draft: {draft}</p>',
		),
		fieldOnly: noteSource('() => (open = !open)', ''),
	};
	for (const [name, source] of Object.entries(shapes)) {
		const result = await compile(`src/${name}.tsrx`, source);
		expect(result.symbolModules.diagnostics, name).toEqual([]);
		const module = branchModule(result);
		expect(module, name).toContain('<label>Your message<input');
		expect(module, name).toContain(
			'{ "attribute": { "name": "value", "read": { "graphNodeId": "state:draft", "path": [] } } }',
		);
		expect(module, name).toContain(
			'import { marklessAttributeHtml } from "@markless/web/fns/attribute-html";',
		);
		const records = result.protocolView.branches?.[0]?.armRecords?.[0];
		expect(records?.events.map((event) => event.eventName), name).toEqual(['input']);
		expect(records?.domUpdates.map((update) => update.target.kind)[0], name).toBe('property');
	}
});

test('a @switch arm rebuilds an attribute its name and quotes already surround', async () => {
	const result = await compile(
		'src/Links.tsrx',
		`
import { state } from '@markless/core';

export function Links() @{
	let tab = state('docs');
	let target = state('/guide');
	<nav>
		<button onClick={() => (tab = tab === 'docs' ? 'none' : 'docs')}>Switch</button>
		@switch (tab) {
			@case 'docs': {
				<a href={target === '' ? '/none' : '/guide'} aria-busy={target === ''}>Guide</a>
			}
			@default: {
				<span>Nothing</span>
			}
		}
	</nav>
}`,
	);
	expect(result.symbolModules.diagnostics).toEqual([]);
	const module = branchModule(result) ?? '';
	expect(module).toMatch(/"attribute": \{ "name": "href", "read": [^}]+\}, "alwaysPresent": true \}/);
	expect(module).toMatch(/"attribute": \{ "name": "aria-busy", "read": [^}]+\} \}/);
});

test('an attribute in a repeated row inside an @if still refuses, in author words', async () => {
	const result = await compile(
		'src/Rows.tsrx',
		`
import { state } from '@markless/core';

export function Rows() @{
	let open = state(false);
	let items = state([{ id: 1, label: 'one' }]);
	<div>
		<button onClick={() => (open = !open)}>Open</button>
		@if (open) {
			<ul>
				@for (const item of items; key item.id) {
					<li title={item.label}>{item.label}</li>
				}
			</ul>
		}
	</div>
}`,
	);
	const diagnostic = result.symbolModules.diagnostics.find(
		(entry) => entry.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
	);
	expect(diagnostic?.message).toBe(
		'this @if (open) cannot be rebuilt when open changes because a repeated row inside it holds a attribute binding.',
	);
});
