import { expect, test } from 'vitest';
import { createStyleConstResolver } from '../src/passes/semantic-graph/style-object.ts';

/**
 * Scope-resolution parity for the style const resolver.
 *
 * These cases pin the answers the hand-rolled scope-span index used to give, so
 * the move to the analyzer's scope and symbol tables is provably a like-for-like
 * swap rather than a re-specification. The hoisting cases matter most: neither
 * implementation models the temporal dead zone, so a `let` read above its own
 * declaration still resolves to that `let`, and a `var` declared inside a block
 * is still visible after it.
 */

const HEADER = "import { state } from '@markless/core';\n";

function resolverFor(source: string) {
	return createStyleConstResolver(source, 'src/Scoped.tsrx');
}

/** Offset of the `n`th occurrence of `needle`, counting from 1. */
function offsetOf(source: string, needle: string, occurrence = 1): number {
	let index = -1;
	for (let seen = 0; seen < occurrence; seen += 1) {
		index = source.indexOf(needle, index + 1);
		expect(index, `occurrence ${occurrence} of ${needle}`).toBeGreaterThanOrEqual(0);
	}
	return index;
}

test('a `let` read above its own declaration resolves to that `let`, not the outer const', () => {
	const source = `${HEADER}const box = { color: 'red' };
export function App() @{
	<div style={{ ...box }} />
	let box = { color: 'blue' };
	box = { color: 'green' };
}
`;
	const resolver = resolverFor(source);
	const usagePos = offsetOf(source, '...box') + 3;
	const modulePos = offsetOf(source, 'const box') + 6;

	expect(resolver.resolveObject('box', usagePos)).toEqual({
		reason:
			'a `let` binding `box` — the compiler freezes style objects at build time, so only an unmodified `const` qualifies',
	});
	expect(resolver.sameBindingAtBothSites('box', modulePos, usagePos)).toBe(false);
});

test('a `var` declared inside a block stays visible after the block, a `const` does not', () => {
	const source = `${HEADER}export function App() @{
	@if (true) {
		var box = { color: 'blue' };
		const inner = { color: 'green' };
		<span style={{ ...inner }} />
	}
	<div style={{ ...box }} />
}
`;
	const resolver = resolverFor(source);
	// One position inside the branch block and one after it, both asked about
	// both names: `var` survives the block, `const` does not.
	const boxUsagePos = offsetOf(source, '...box') + 3;
	const innerInBlockPos = offsetOf(source, '...inner') + 3;
	const innerAfterBlockPos = boxUsagePos;
	const varDeclPos = offsetOf(source, 'var box') + 4;

	expect(resolver.resolveObject('box', boxUsagePos)).toEqual({
		reason:
			'a `var` binding `box` — the compiler freezes style objects at build time, so only an unmodified `const` qualifies',
	});
	expect(resolver.sameBindingAtBothSites('box', varDeclPos, boxUsagePos)).toBe(true);

	// The block-scoped const is gone once the block closes: no binding at all,
	// which reads as "not a same-file const" rather than as a named refusal.
	expect(resolver.resolveObject('inner', innerInBlockPos)).toBeTruthy();
	expect(resolver.resolveObject('inner', innerAfterBlockPos)).toBeNull();
	expect(resolver.sameBindingAtBothSites('inner', innerInBlockPos, innerAfterBlockPos)).toBe(false);
});

test('a catch-clause parameter shadows an outer const for the whole catch block', () => {
	const source = `${HEADER}const box = { color: 'red' };
function readBox() {
	try {
		return box;
	} catch (box) {
		return box;
	}
}
export function App() @{
	<div style={{ ...box }} />
}
`;
	const resolver = resolverFor(source);
	const modulePos = offsetOf(source, 'const box') + 6;
	const tryPos = offsetOf(source, 'return box', 1) + 7;
	const catchPos = offsetOf(source, 'return box', 2) + 7;

	expect(resolver.resolveObject('box', catchPos)).toBeNull();
	expect(resolver.sameBindingAtBothSites('box', modulePos, catchPos)).toBe(false);
	expect(resolver.sameBindingAtBothSites('box', modulePos, tryPos)).toBe(true);
});

test('an inner declaration between the usage and an outer const wins the lookup', () => {
	const source = `${HEADER}const box = { color: 'red' };
export function App() @{
	const box = { color: 'blue' };
	<div style={{ ...box }} />
}
`;
	const resolver = resolverFor(source);
	const outerPos = offsetOf(source, 'const box', 1) + 6;
	const innerPos = offsetOf(source, 'const box', 2) + 6;
	const usagePos = offsetOf(source, '...box') + 3;

	const resolved = resolver.resolveObject('box', usagePos);
	expect(resolved?.object?.start).toBe(offsetOf(source, "{ color: 'blue' }"));
	expect(resolver.resolveObject('box', outerPos)?.object?.start).toBe(
		offsetOf(source, "{ color: 'red' }"),
	);
	expect(resolver.sameBindingAtBothSites('box', outerPos, usagePos)).toBe(false);
	expect(resolver.sameBindingAtBothSites('box', innerPos, usagePos)).toBe(true);
});

test('a branch code block gets its own scope, so a branch-local const shadows the module one', () => {
	const source = `${HEADER}const box = { color: 'red' };
export function App() @{
	<div style={{ ...box }} />
	@if (true) {
		const box = { color: 'blue' };
		<span style={{ ...box }} />
	}
}
`;
	const resolver = resolverFor(source);
	const outerUsagePos = offsetOf(source, '...box', 1) + 3;
	const branchUsagePos = offsetOf(source, '...box', 2) + 3;

	expect(resolver.resolveObject('box', outerUsagePos)?.object?.start).toBe(
		offsetOf(source, "{ color: 'red' }"),
	);
	expect(resolver.resolveObject('box', branchUsagePos)?.object?.start).toBe(
		offsetOf(source, "{ color: 'blue' }"),
	);
	expect(resolver.sameBindingAtBothSites('box', outerUsagePos, branchUsagePos)).toBe(false);
});

test('a function parameter shadows an outer const inside that function only', () => {
	const source = `${HEADER}const box = { color: 'red' };
function make(box) {
	return box;
}
export function App() @{
	<div style={{ ...box }} />
}
`;
	const resolver = resolverFor(source);
	const paramUsagePos = offsetOf(source, 'return box') + 7;
	const usagePos = offsetOf(source, '...box') + 3;

	expect(resolver.resolveObject('box', paramUsagePos)).toBeNull();
	expect(resolver.sameBindingAtBothSites('box', usagePos, paramUsagePos)).toBe(false);
});

test('a destructured declaration binds the name without qualifying as a const object', () => {
	const source = `${HEADER}const box = { color: 'red' };
export function App(props) @{
	const { box } = props;
	<div style={{ ...box }} />
}
`;
	const resolver = resolverFor(source);
	const modulePos = offsetOf(source, 'const box') + 6;
	const usagePos = offsetOf(source, '...box') + 3;

	expect(resolver.resolveObject('box', usagePos)).toBeNull();
	expect(resolver.sameBindingAtBothSites('box', modulePos, usagePos)).toBe(false);
});

test('an imported binding is refused by name rather than resolved', () => {
	const source = `${HEADER}import { box } from './styles.ts';
export function App() @{
	<div style={{ ...box }} />
}
`;
	const resolver = resolverFor(source);
	const usagePos = offsetOf(source, '...box') + 3;

	expect(resolver.resolveObject('box', usagePos)).toEqual({
		reason: 'the import `box` — only a `const` object literal declared in this file resolves here',
	});
});

test('a const exported at its declaration is refused as exported', () => {
	const source = `${HEADER}export const box = { color: 'red' };
export function App() @{
	<div style={{ ...box }} />
}
`;
	const resolver = resolverFor(source);
	const usagePos = offsetOf(source, '...box') + 3;

	expect(resolver.resolveObject('box', usagePos)).toEqual({
		reason: 'the const `box`, which is exported, so other files could change it',
	});
});

test('a const exported through an export list is refused as exported', () => {
	const source = `${HEADER}const box = { color: 'red' };
export function App() @{
	<div style={{ ...box }} />
}
export { box };
`;
	const resolver = resolverFor(source);
	const usagePos = offsetOf(source, '...box') + 3;

	expect(resolver.resolveObject('box', usagePos)).toEqual({
		reason: 'the const `box`, which is exported, so other files could change it',
	});
});

// Pins the one place where "exported" and "used as more than a property read"
// disagree: a default export is an escaping use, and it is reported as one.
test('a const sent out as the default export is refused as an escaping use, not as exported', () => {
	const source = `${HEADER}const box = { color: 'red' };
export function App() @{
	<div style={{ ...box }} />
}
export default box;
`;
	const resolver = resolverFor(source);
	const usagePos = offsetOf(source, '...box') + 3;

	expect(resolver.resolveObject('box', usagePos)).toEqual({
		reason:
			'the const `box`, which is used outside style attributes as more than a property read',
	});
});

// Order matters: an earlier disqualifying use is reported ahead of a later
// export, so marking a binding exported must not jump the queue.
test('an earlier reassignment outranks a later export list in the refusal reason', () => {
	const source = `${HEADER}let box = { color: 'red' };
box = { color: 'green' };
export function App() @{
	<div style={{ ...box }} />
}
export { box };
`;
	const resolver = resolverFor(source);
	const usagePos = offsetOf(source, '...box') + 3;

	expect(resolver.resolveObject('box', usagePos)).toEqual({
		reason:
			'a `let` binding `box` — the compiler freezes style objects at build time, so only an unmodified `const` qualifies',
	});
});

test('resolveString reads the innermost visible string const', () => {
	const source = `${HEADER}const KEY = 'font-size';
export function App() @{
	<div style={{ [KEY]: '2rem' }} />
	@if (true) {
		const KEY = 'line-height';
		<span style={{ [KEY]: 2 }} />
	}
}
`;
	const resolver = resolverFor(source);
	const outerKeyPos = offsetOf(source, '[KEY]', 1) + 1;
	const branchKeyPos = offsetOf(source, '[KEY]', 2) + 1;

	expect(resolver.resolveString('KEY', outerKeyPos)).toBe('font-size');
	expect(resolver.resolveString('KEY', branchKeyPos)).toBe('line-height');
	expect(resolver.resolveString('missing', outerKeyPos)).toBeNull();
});

/**
 * A wider sweep over the constructs where the analyzer's scope tree and the
 * span index it replaced could plausibly disagree: scopes the span index never
 * modelled (class bodies, named function expressions), and heads that sit
 * outside the body they bind into (loop heads, default parameters).
 *
 * Each case answers the same three questions about `box` at a marked position,
 * flattened to a string so one comparison covers the whole battery.
 */
const BATTERY: ReadonlyArray<{ readonly name: string; readonly source: string }> = [
	{
		name: 'named function expression whose name shadows the const',
		source: `const box = { color: 'red' };
const make = function box() {
	return box;
};
`,
	},
	{
		name: 'named class expression whose name shadows the const',
		source: `const box = { color: 'red' };
const Panel = class box {
	render() {
		return box;
	}
};
`,
	},
	{
		name: 'class declaration body between the usage and the const',
		source: `const box = { color: 'red' };
class Panel {
	render() {
		return box;
	}
}
`,
	},
	{
		name: 'for-loop head binding shadowing the const',
		source: `const box = { color: 'red' };
function run() {
	for (let box = 0; box < 2; box += 1) {
		use(box);
	}
}
`,
	},
	{
		name: 'for-of head binding shadowing the const',
		source: `const box = { color: 'red' };
function run(list) {
	for (const box of list) {
		use(box);
	}
}
`,
	},
	{
		name: 'default parameter reading the const from the function header',
		source: `const box = { color: 'red' };
function run(value = box) {
	return value;
}
`,
	},
	{
		name: 'switch case block declaring the name',
		source: `const box = { color: 'red' };
function run(value) {
	switch (value) {
		case 1: {
			const box = { color: 'blue' };
			use(box);
			break;
		}
		default:
			use(box);
	}
}
`,
	},
	{
		name: 'arrow function parameter shadowing the const',
		source: `const box = { color: 'red' };
const run = (box) => box;
`,
	},
	{
		name: 'static block declaring the name',
		source: `const box = { color: 'red' };
class Panel {
	static {
		const box = { color: 'blue' };
		use(box);
	}
}
`,
	},
	{
		name: 'redeclared var keeps the last initializer',
		source: `function run() {
	var box = { color: 'red' };
	var box = { color: 'blue' };
	use(box);
}
`,
	},
	{
		name: 'a nested function body between the usage and the const',
		source: `const box = { color: 'red' };
function outer() {
	function inner() {
		return box;
	}
	return inner;
}
`,
	},
];

test('scope resolution answers the same questions the span index did', () => {
	const answers = BATTERY.map(({ name, source }) => {
		const full = `${HEADER}${source}export function App() @{
	<div style={{ ...box }} />
}
`;
		const resolver = resolverFor(full);
		// The last `box` written before the component is the marked position.
		const markedPos = full.lastIndexOf('box', full.indexOf('export function App'));
		const stylePos = offsetOf(full, '...box') + 3;
		const object = resolver.resolveObject('box', markedPos);
		return [
			name,
			object === null
				? 'null'
				: (object.reason ?? `object@${object.object?.start ?? '?'}`),
			String(resolver.resolveString('box', markedPos)),
			String(resolver.sameBindingAtBothSites('box', markedPos, stylePos)),
		].join(' | ');
	});

	expect(answers).toEqual([
		// A function or class expression's own name is deliberately not bound
		// here: the const it shadows is still what an inner `box` resolves to, so
		// the self-reference is charged against the const. That is wrong by JS
		// scoping rules and is pinned only to keep this migration behaviour-free.
		'named function expression whose name shadows the const | the const `box`, which is aliased into another binding or value, so the compiler cannot prove it stays unchanged | null | true',
		'named class expression whose name shadows the const | the const `box`, which is aliased into another binding or value, so the compiler cannot prove it stays unchanged | null | true',
		'class declaration body between the usage and the const | the const `box`, which is aliased into another binding or value, so the compiler cannot prove it stays unchanged | null | true',
		'for-loop head binding shadowing the const | null | null | false',
		'for-of head binding shadowing the const | null | null | false',
		'default parameter reading the const from the function header | the const `box`, which is used outside style attributes as more than a property read | null | true',
		'switch case block declaring the name | the const `box`, which is passed to a function that could change it | null | true',
		'arrow function parameter shadowing the const | null | null | false',
		'static block declaring the name | the const `box`, which is passed to a function that could change it | null | false',
		'redeclared var keeps the last initializer | a `var` binding `box` — the compiler freezes style objects at build time, so only an unmodified `const` qualifies | null | false',
		'a nested function body between the usage and the const | the const `box`, which is aliased into another binding or value, so the compiler cannot prove it stays unchanged | null | true',
	]);
});

test('a name with no binding anywhere resolves the same at every position', () => {
	const source = `${HEADER}export function App() @{
	<div style={{ color: 'red' }} />
}
`;
	const resolver = resolverFor(source);

	expect(resolver.resolveObject('nothing', 0)).toBeNull();
	expect(resolver.resolveString('nothing', 0)).toBeNull();
	expect(resolver.sameBindingAtBothSites('nothing', 0, source.length - 1)).toBe(true);
});
