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
			<>
				<label>
					Your message
					<input value={draft} onInput={(event) => (draft = event.currentTarget.value)} />
				</label>
				${afterField}
			</>
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
			<>
				<em>first</em>
				<strong>second</strong>
			</>
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

// A flip rebuilds the arm from graph reads, so module values ride constant computeds the payload serves.
test('module values an @if arm shows as attributes, text and child props rebuild with the arm', async () => {
	const result = await compile(
		'src/Menu.tsrx',
		`
import { state } from '@markless/core';
import mark from './mark.svg';
import { ROUTES } from './routes.ts';

const SUFFIX = '!';

function Badge(props: { src: string }) @{
	<img src={props.src} alt="" />
}

export function Menu() @{
	let open = state(false);
	<div>
		<button onClick={() => (open = !open)}>Flip</button>
		@if (open) {
			<>
				<a href={ROUTES.home} title={'go' + SUFFIX}>{ROUTES.label}</a>
				<Badge src={mark} />
			</>
		}
	</div>
}`,
	);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	const arm = branchModule(result);
	expect(arm).toBeDefined();
	const reads = [...(arm ?? '').matchAll(/computed:templateExpression:(\d+)/g)].map(
		(match) => match[0],
	);
	expect(new Set(reads).size).toBe(4);
	const lifted = result.semanticGraph.graphBindings.filter((binding) =>
		binding.id.startsWith('computed:templateExpression:'),
	);
	expect(lifted.map((binding) => binding.functionSource)).toEqual([
		'() => ROUTES.home',
		"() => 'go' + SUFFIX",
		'() => ROUTES.label',
		'() => mark',
	]);
	expect(lifted.every((binding) => binding.dependencies?.length === 0)).toBe(true);
});

test('a module value outside any @if stays a plain authored value', async () => {
	const result = await compile(
		'src/Plain.tsrx',
		`
import { ROUTES } from './routes.ts';

export function Plain() @{
	<a href={ROUTES.home}>{ROUTES.label}</a>
}`,
	);
	expect(
		result.semanticGraph.graphBindings.some((binding) =>
			binding.id.startsWith('computed:templateExpression:'),
		),
	).toBe(false);
});

test('a child in an @if arm writes the attributes its constant props decide into the arm markup', async () => {
	const result = await compile(
		'src/Icons.tsrx',
		`
import { state } from '@markless/core';

function Glyph({ size, label, hidden, tone }) @{
	<svg width={size} aria-label={label} aria-hidden={hidden} class={tone}></svg>
}

export function Toggle() @{
	let on = state(false);
	let tone = state('calm');
	<button onClick={() => (on = !on)}>
		@if (on) { <Glyph size={15} label={'say "hi"'} hidden={true} tone={tone} /> } @else { <Glyph size={13} hidden={false} tone="x" /> }
	</button>
}`,
	);
	expect(result.symbolModules.diagnostics).toEqual([]);
	const module = branchModule(result) ?? '';
	expect(module).toContain(
		'[[{ "text": "<svg width=\\"15\\" aria-label=\\"say &quot;hi&quot;\\" aria-hidden=\\"true\\"" }, { "attribute": { "name": "class", "read": { "graphNodeId": "state:tone", "path": [] } } }, { "text": "></svg>" }], [{ "text": "<svg width=\\"13\\" class=\\"x\\"></svg>" }]]',
	);
});

// A flip has no component body to read a body const from, so it rides a computed of the const's definition.
test('body consts an @if arm shows as attributes, text and child props rebuild with the arm', async () => {
	const result = await compile(
		'src/Details.tsrx',
		`
import { state } from '@markless/core';

const LABELS: Record<string, string> = { a: 'Alpha' };

function Caption(props: { text: string }) @{
	<small>{props.text}</small>
}

export function Details({ slug }: { slug: string }) @{
	const id = 'details-' + slug;
	const label = LABELS[slug] ?? slug;
	let open = state(false);
	<section>
		<button onClick={() => (open = !open)}>Flip</button>
		@if (open) {
			const note = label + '!';
			<>
				<p id={id} title={note}>{label}</p>
				<Caption text={label} />
			</>
		}
	</section>
}`,
	);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(branchModule(result)).toBeDefined();
	const lifted = result.semanticGraph.graphBindings.filter((binding) =>
		binding.id.startsWith('computed:templateExpression:'),
	);
	expect(lifted.map((binding) => binding.functionSource)).toEqual([
		"() => ((open)) ? ('details-' + slug) : undefined",
		"() => ((open)) ? ((LABELS[slug] ?? slug) + '!') : undefined",
		'() => ((open)) ? (LABELS[slug] ?? slug) : undefined',
		'() => ((open)) ? (LABELS[slug] ?? slug) : undefined',
	]);
	for (const binding of lifted)
		expect(binding.dependencies?.map((dependency) => dependency.source).sort()).toEqual([
			'open',
			'slug',
		]);
});

// Computeds are derived eagerly at render, so a lifted body const must not read past the arm guarding it.
test('a body const an arm shows is only computed while every enclosing arm condition holds', async () => {
	const result = await compile(
		'src/Profile.tsrx',
		`
import { state } from '@markless/core';

const PEOPLE: Record<string, { name: string; team?: { label: string } }> = {};

export function Profile({ who }: { who?: string }) @{
	let mode = state('card');
	const person = who ? PEOPLE[who] : undefined;
	<aside>
		<button onClick={() => (mode = mode === 'card' ? 'row' : 'card')}>Mode</button>
		@if (!person) {
			<em>nobody</em>
		} @else {
			@switch (mode) {
				@case 'card': {
					@if (person.team) {
						<b title={person.team.label}>{person.name}</b>
					}
				}
				@default: {
					<i>{person.name}</i>
				}
			}
		}
	</aside>
}`,
	);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	const lifted = result.semanticGraph.graphBindings.filter((binding) =>
		binding.id.startsWith('computed:templateExpression:'),
	);
	const person = '(who ? PEOPLE[who] : undefined)';
	expect(lifted.map((binding) => binding.functionSource)).toEqual([
		`() => (!(!${person}) && (mode) === ('card') && (${person}.team)) ? ${person}.team.label : undefined`,
		`() => (!(!${person}) && (mode) === ('card') && (${person}.team)) ? ${person}.name : undefined`,
		`() => (!(!${person}) && !((mode) === ('card'))) ? ${person}.name : undefined`,
	]);
});
