import { expect, test } from 'vitest';
import {
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
