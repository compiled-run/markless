import { expect, test } from 'vitest';
import {
	analyzeModule,
	isEventAttribute,
	normalizeEventName,
	parseModule,
	type MarklessCompileError,
	type MarklessParserComment,
} from '../src/yuku-tsrx-adapter.ts';

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

test('adapts yuku-tsrx recovery channels to Markless-owned error and comment shapes', () => {
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

test('adapts parser diagnostic anchors to Markless authored tokens', () => {
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

test('uses yuku-tsrx parser-owned loose recovery and event naming', () => {
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
});

test('decorates wrapper-owned control flow with non-enumerable shared-reference aliases', () => {
	const program = parseModule(`export function Constructs({ value, items, load }) @{
	<section>
		@switch (value.kind) {
			@case 'a': { <span>{value.label}</span> }
			@default: { <span>{value.count}</span> }
		}
		@try { <span>{load()}</span> } @pending { <span>pending</span> } @catch (error) { <span>{error.message}</span> }
		@for (const item of items; index i; key item.id) { <span>{i} {item.id}</span> } @empty { <span>empty</span> }
	</section>
}`);

	for (const [type, aliases] of [
		['JSXForExpression', ['left', 'right', 'body', 'index', 'key', 'await']],
		['JSXSwitchExpression', ['discriminant', 'cases']],
		['JSXTryExpression', ['block', 'handler', 'finalizer']],
	] as const) {
		const wrapper = findNode(program, type);
		const statement = wrapper.statement as AstNode;
		for (const alias of aliases) {
			expect(wrapper[alias]).toBe(statement[alias]);
			expect(Object.getOwnPropertyDescriptor(wrapper, alias)).toMatchObject({
				enumerable: false,
			});
			expect(Object.keys(wrapper)).not.toContain(alias);
		}
	}

	const repeat = findNode(program, 'JSXForExpression');
	const boundary = findNode(program, 'JSXTryExpression');
	expect(Object.keys(repeat)).toContain('statement');
	expect(Object.keys(repeat)).toContain('empty');
	expect(Object.keys(boundary)).toContain('pending');
});

test('blanks exact markless-allow JSX text without changing spans or ordinary text', () => {
	const parseText = (text: string): { node: AstNode; sourceText: string } => {
		const source = `export function App() @{ <section>${text}</section> }`;
		const node = findNode(parseModule(source), 'JSXText');
		return {
			node,
			sourceText: source.slice(node.start as number, node.end as number),
		};
	};

	const valid = parseText(
		'\n// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: static list, order never changes\n',
	);
	const blanked = valid.node.value as string;
	expect(blanked).toHaveLength(valid.sourceText.length);
	expect(blanked).toMatch(/^\s+$/);
	expect([...blanked.matchAll(/[\r\n]/g)].map((match) => match.index)).toEqual(
		[...valid.sourceText.matchAll(/[\r\n]/g)].map((match) => match.index),
	);

	for (const text of [
		'// ordinary slash text',
		'prefix // markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: mixed text',
		'// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX',
		'// markless-allow lowercase_code: reason',
	]) {
		const ordinary = parseText(text);
		expect(ordinary.node.value).toBe(ordinary.sourceText);
	}
});

const ids = (count: number): number[] => Array.from({ length: count }, (_, id) => id);

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

	const semantic = analyzeModule(source, 'counter.tsrx');

	// Every binding the module declares is present, imported one included.
	const symbolNames = ids(semantic.symbol.count).map((id) => semantic.symbol.name(id));
	expect(symbolNames).toEqual(expect.arrayContaining(['state', 'Counter', 'total', 'bump']));

	// The point of the view: a use of `total` resolves to the declaration of
	// `total`, rather than the walk having to match on the name itself.
	const totalSymbol = symbolNames.indexOf('total');
	const totalUses = ids(semantic.reference.count).filter(
		(id) => semantic.reference.symbolId(id) === totalSymbol,
	);
	// The assignment target, the addend it reads, and the interpolation.
	expect(totalUses).toHaveLength(3);
	for (const id of totalUses) {
		expect(semantic.reference.name(id)).toBe('total');
		expect(semantic.reference.node(id).type).toBe('Identifier');
		// The span is a real authored span, not a placeholder.
		expect(source.slice(semantic.reference.start(id), semantic.reference.end(id))).toBe('total');
	}
	// Only the assignment target is a write.
	expect(totalUses.filter((id) => semantic.reference.isWrite(id))).toHaveLength(1);

	// The declaration site is reachable from the symbol.
	const declaration = semantic.symbol.declNode(totalSymbol, 0);
	expect(semantic.symbol.declCount(totalSymbol)).toBe(1);
	expect(source.slice(declaration.start, declaration.end)).toBe('total');

	// `total` belongs to the component body, not to module scope.
	const totalScope = semantic.symbol.scopeId(totalSymbol);
	expect(semantic.scope.kind(totalScope)).toBe('block');
	expect(semantic.scope.parentId(totalScope)).not.toBeNull();

	// Module edges carry their specifiers, so an import can be attributed to the
	// package it came from without re-reading the import statement.
	expect(
		ids(semantic.import.count).map((id) => ({
			name: semantic.import.name(id),
			specifier: semantic.import.specifier(id),
		})),
	).toContainEqual({ name: 'state', specifier: '@markless/core' });
	expect(ids(semantic.export.count).map((id) => semantic.export.name(id))).toContain('Counter');
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

	const semantic = analyzeModule(source, 'panel.tsrx');
	const symbolNames = ids(semantic.symbol.count).map((id) => semantic.symbol.name(id));
	expect(symbolNames).toEqual(
		expect.arrayContaining(['computed', 'state', 'Panel', 'label', 'upper', 'event']),
	);

	// Resolution follows the binding, not the name: the handler parameter and
	// the component local are different symbols even though both are read here.
	const labelSymbol = symbolNames.indexOf('label');
	const labelUses = ids(semantic.reference.count).filter(
		(id) => semantic.reference.symbolId(id) === labelSymbol,
	);
	expect(labelUses).toHaveLength(3);
	for (const id of labelUses) {
		expect(source.slice(semantic.reference.start(id), semantic.reference.end(id))).toBe('label');
	}
	// Only the assignment inside the event handler writes.
	expect(labelUses.filter((id) => semantic.reference.isWrite(id))).toHaveLength(1);

	// Both named imports resolve to the same specifier.
	expect(ids(semantic.import.count).map((id) => semantic.import.specifier(id))).toEqual([
		'@markless/core',
		'@markless/core',
	]);
	expect(ids(semantic.export.count).map((id) => semantic.export.name(id))).toContain('Panel');
});
