import { expect, test } from 'vitest';
import { analyze } from '@tsrx/yuku';
import { isEventAttribute, normalizeEventName } from '../src/ast/events.ts';
import {
	parseModule,
	type MarklessCompileError,
	type MarklessParserComment,
} from '../src/js-ast.ts';

type AstNode = Record<string, unknown> & { type: string };

function findNode(root: unknown, type: string): AstNode {
	const visited = new Set<object>();
	const visit = (value: unknown): AstNode | null => {
		if (!value || typeof value !== 'object' || visited.has(value)) return null;
		visited.add(value);
		if (!Array.isArray(value) && (value as { type?: unknown }).type === type) {
			return value as AstNode;
		}
		for (const child of Array.isArray(value) ? value : Object.values(value)) {
			const found = visit(child);
			if (found) return found;
		}
		return null;
	};
	const found = visit(root);
	if (!found) throw new Error(`missing ${type}`);
	return found;
}

test('reshapes parser recovery channels into Markless-owned error and comment shapes', () => {
	const source = '/* lead */ const = ;';
	const errors: MarklessCompileError[] = [];
	const comments: MarklessParserComment[] = [];
	const program = parseModule(source, 'broken.tsrx', {
		collect: true,
		errors,
		comments,
	});

	expect(program.type).toBe('Program');
	expect(errors).toEqual([
		expect.objectContaining({
			name: 'SyntaxError',
			type: 'fatal',
			fileName: 'broken.tsrx',
			pos: expect.any(Number),
			end: expect.any(Number),
			loc: expect.objectContaining({
				start: expect.objectContaining({ line: 1, column: expect.any(Number) }),
				end: expect.objectContaining({ line: 1, column: expect.any(Number) }),
			}),
		}),
	]);
	expect(comments).toEqual([
		expect.objectContaining({ type: 'Block', value: ' lead ', start: 0, end: 10 }),
	]);
	expect(() => parseModule(source, 'broken.tsrx')).toThrow(SyntaxError);
});

test('reports parser diagnostics on the authored tokens', () => {
	const cases = [
		{
			source: 'export function Controls() @{ <button>Save</button>> }',
			expected: (source: string) => source.indexOf('</button>>') + '</button>'.length,
		},
		{
			source: 'export function Notice() @{ <article>Waiting</section> }',
			expected: (source: string) => source.indexOf('</section>'),
		},
	];

	const anchors = cases.map(({ source }, index) => {
		const errors: MarklessCompileError[] = [];
		parseModule(source, `anchor-${index}.tsrx`, { collect: true, errors });
		return errors[0]?.pos;
	});

	expect(anchors).toEqual(cases.map(({ source, expected }) => expected(source)));
});

test('classifies recoverable duplicate bindings as usage diagnostics', () => {
	const source = `export default function Duplicate() @{
	let repeated = 1;
	let repeated = 2;
	<span>{repeated}</span>
}`;
	const errors: MarklessCompileError[] = [];
	const program = parseModule(source, 'Duplicate.tsrx', { loose: true, errors });
	const secondBinding = source.indexOf('repeated', source.indexOf('repeated') + 1);

	expect(program.type).toBe('Program');
	expect(errors).toEqual([
		expect.objectContaining({
			message: expect.stringContaining("Identifier 'repeated' has already been declared"),
			type: 'usage',
			pos: secondBinding,
		}),
	]);
});

test('keeps loose recovery and comments, and names events the way the compiler does', () => {
	const comments: MarklessParserComment[] = [];
	const program = parseModule(
		'export function App() @{ <div>{/* kept */}<span>text</div> }',
		'App.tsrx',
		{ collect: true, loose: true, comments },
	);

	expect(program.type).toBe('Program');
	expect(comments).toEqual(
		expect.arrayContaining([expect.objectContaining({ type: 'Block', value: ' kept ' })]),
	);
	expect(isEventAttribute('onClick')).toBe(true);
	expect(isEventAttribute('onclick')).toBe(false);
	expect(normalizeEventName('onPointerDownCapture')).toBe('pointerdown');
	expect(normalizeEventName('onGotPointerCapture')).toBe('gotpointercapture');
});

test('reads control-flow fields on the wrapper itself, an @else if as an @if, and an @case body as its nodes', () => {
	const program = parseModule(`export function Constructs({ value, items, load }) @{
	<section>
		@switch (value.kind) {
			@case 'a': { <span>{value.label}</span> }
			@default: { <span>{value.count}</span> }
		}
		@try { <span>{load()}</span> } @pending { <span>pending</span> } @catch (error) { <span>{error.message}</span> }
		@for (const item of items; index i; key item.id) { <span>{i} {item.id}</span> } @empty { <span>empty</span> }
		@if (value.a) { <b>a</b> } @else if (value.b) { <b>b</b> } @else { <b>c</b> }
	</section>
}`);

	const repeat = findNode(program, 'JSXForExpression');
	for (const field of ['left', 'right', 'body', 'index', 'key', 'empty']) {
		expect(repeat[field]).toBeTruthy();
	}
	const boundary = findNode(program, 'JSXTryExpression');
	for (const field of ['block', 'pending', 'handler']) expect(boundary[field]).toBeTruthy();

	const choice = findNode(program, 'JSXSwitchExpression');
	const [first] = choice.cases as AstNode[];
	expect((first!.consequent as AstNode[]).map((node) => node.type)).toEqual(['JSXElement']);

	const branch = findNode(program, 'JSXIfExpression');
	expect((branch.alternate as AstNode).type).toBe('JSXIfExpression');
	expect(((branch.alternate as AstNode).alternate as AstNode).type).toBe('BlockStatement');
});

test('drops comment lines and empty containers among JSX children, and keeps `//` that is text', () => {
	const childrenOf = (text: string): AstNode[] => {
		const source = `export function App() @{ <section>${text}</section> }`;
		return findNode(parseModule(source), 'JSXElement').children as AstNode[];
	};

	const directive = childrenOf(
		'\n// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: static list, order never changes\n',
	);
	expect(directive.map((child) => child.type)).toEqual(['JSXText', 'JSXText']);
	expect(directive.every((child) => (child.value as string).trim() === '')).toBe(true);

	expect(childrenOf('{/* note */}{}<b />').map((child) => child.type)).toEqual(['JSXElement']);

	const [url] = childrenOf('see http://example.com');
	expect(url?.value).toBe('see http://example.com');
});

test('resolves TSRX identifiers to their bindings, with the node and span of each use', () => {
	const source = [
		'import { state } from "@markless/core";',
		'',
		'export function Counter() @{',
		'	let total = state(0);',
		'	const bump = () => { total = total + 1; };',
		'	<button onClick={bump}>{total}</button>',
		'}',
		'',
	].join('\n');

	const module = analyze(source);

	expect(module.bindings.map((binding) => binding.name)).toEqual(
		expect.arrayContaining(['state', 'Counter', 'total', 'bump']),
	);

	// A use of `total` resolves to the declaration of `total`, not to a name match.
	const total = module.bindings.find((binding) => binding.name === 'total')!;
	const totalUses = module.references.filter((reference) => reference.binding === total);
	// The assignment target, the addend it reads, and the interpolation.
	expect(totalUses).toHaveLength(3);
	for (const reference of totalUses) {
		expect(reference.name).toBe('total');
		expect(reference.node.type).toBe('Identifier');
		expect(source.slice(reference.node.start, reference.node.end)).toBe('total');
	}
	expect(totalUses.filter((reference) => reference.isWrite)).toHaveLength(1);

	const [declaration] = total.declarations;
	expect(total.declarations).toHaveLength(1);
	expect(source.slice(declaration!.start, declaration!.end)).toBe('total');

	// `total` belongs to the component body, not to module scope.
	expect(total.scope.kind).toBe('block');
	expect(total.scope.parent).not.toBeNull();

	expect(
		module.imports.map((record) => ({ name: record.name, specifier: record.specifier })),
	).toContainEqual({ name: 'state', specifier: '@markless/core' });
	expect(module.exports.map((record) => record.name)).toContain('Counter');
});

test('analyzes a module whose names and shape differ from the counter fixture', () => {
	const source = [
		'import { computed, state } from "@markless/core";',
		'',
		'export function Panel() @{',
		'	let label = state("");',
		'	const upper = computed(() => label.toUpperCase());',
		'	<section>',
		'		<input value={label} onInput={(event) => { label = event.target.value; }} />',
		'		<span>{upper}</span>',
		'	</section>',
		'}',
		'',
	].join('\n');

	const module = analyze(source);
	expect(module.bindings.map((binding) => binding.name)).toEqual(
		expect.arrayContaining(['computed', 'state', 'Panel', 'label', 'upper', 'event']),
	);

	// Resolution follows the binding, not the name: the handler parameter and
	// the component local are different bindings even though both are read here.
	const label = module.bindings.find((binding) => binding.name === 'label')!;
	const labelUses = module.references.filter((reference) => reference.binding === label);
	expect(labelUses).toHaveLength(3);
	for (const reference of labelUses) {
		expect(source.slice(reference.node.start, reference.node.end)).toBe('label');
	}
	expect(labelUses.filter((reference) => reference.isWrite)).toHaveLength(1);

	expect(module.imports.map((record) => record.specifier)).toEqual([
		'@markless/core',
		'@markless/core',
	]);
	expect(module.exports.map((record) => record.name)).toContain('Panel');
});
