import { describe, expect, test } from 'vitest';
import { parse as parseCss } from 'yuku-css';
import { compileTsrxModule } from '../src/index.ts';

// Spec: core TSRX specification section 4.5 "Style Elements and Style Identifiers",
// https://tsrx.dev/specification (4.5.1-4.5.5), and the "Scoped styles" guide at
// https://tsrx.dev/features. Each test names the sentence it checks; `test.fails`
// marks a sentence Markless does not meet yet. Class placement on rendered
// elements is checked in packages/vitest-browser/browser/style-scope-spec.

type CssNode = {
	readonly type: string;
	readonly name?: string;
	readonly property?: string;
	readonly children?: ReadonlyArray<CssNode> | null;
	readonly prelude?: CssNode | null;
	readonly block?: CssNode | null;
	readonly value?: CssNode | string | null;
};

type ScopedRule = {
	/** Class names on the selector's last compound, in order. */
	readonly subjectClasses: ReadonlyArray<string>;
	/** Class names anywhere in the selector, including inside pseudo-class arguments. */
	readonly classes: ReadonlyArray<string>;
	/** Pseudo-class names anywhere in the selector. */
	readonly pseudoClasses: ReadonlyArray<string>;
};

type Sheet = {
	readonly scopeId: string;
	readonly rules: ReadonlyArray<ScopedRule>;
	readonly keyframes: ReadonlyArray<string>;
	/** Identifiers in `animation` and `animation-name` values, vendor-prefixed forms included. */
	readonly animationNames: ReadonlyArray<string>;
};

async function compile(source: string, filename = 'src/Scopes.tsrx') {
	return compileTsrxModule({ filename, source, symbols: [] });
}

async function sheetsOf(source: string, filename?: string): Promise<ReadonlyArray<Sheet>> {
	const result = await compile(source, filename);
	return result.publicRenderPlan.styleScopes.map((scope) =>
		readSheet(scope.scopeId, scope.cssText),
	);
}

function readSheet(scopeId: string, cssText: string): Sheet {
	const { ast } = parseCss(cssText, { parseAtrulePrelude: false });
	const rules: ScopedRule[] = [];
	const keyframes: string[] = [];
	const animationNames: string[] = [];
	const visit = (nodes: ReadonlyArray<CssNode> | null | undefined): void => {
		for (const node of nodes ?? []) {
			if (node.type === 'Rule') {
				for (const selector of node.prelude?.children ?? [])
					rules.push(readSelector(selector));
				visit(node.block?.children);
			} else if (node.type === 'Atrule') {
				if (node.name?.toLowerCase().endsWith('keyframes')) {
					const prelude = node.prelude as CssNode | null;
					if (prelude && typeof prelude.value === 'string')
						keyframes.push(prelude.value.trim());
					continue;
				}
				visit(node.block?.children);
			} else if (
				node.type === 'Declaration' &&
				/^(-[a-z]+-)?animation(-name)?$/.test(node.property ?? '')
			) {
				const value = node.value as CssNode | null;
				for (const part of value?.children ?? []) {
					if (part.type === 'Identifier' && part.name) animationNames.push(part.name);
				}
			}
		}
	};
	visit(ast.children as ReadonlyArray<CssNode>);
	return { scopeId, rules, keyframes, animationNames };
}

function readSelector(selector: CssNode): ScopedRule {
	const parts = selector.children ?? [];
	let compoundStart = 0;
	parts.forEach((part, index) => {
		if (part.type === 'Combinator') compoundStart = index + 1;
	});
	const classes: string[] = [];
	const pseudoClasses: string[] = [];
	const walk = (node: CssNode): void => {
		if (node.type === 'ClassSelector' && node.name) classes.push(node.name);
		if (node.type === 'PseudoClassSelector' && node.name) pseudoClasses.push(node.name);
		for (const child of node.children ?? []) walk(child);
	};
	for (const part of parts) walk(part);
	return {
		subjectClasses: parts
			.slice(compoundStart)
			.flatMap((part) => (part.type === 'ClassSelector' && part.name ? [part.name] : [])),
		classes,
		pseudoClasses,
	};
}

function ruleWith(sheet: Sheet, authoredClass: string): ScopedRule | undefined {
	return sheet.rules.find((rule) => rule.classes.includes(authoredClass));
}

function sheetWith(sheets: ReadonlyArray<Sheet>, authoredClass: string): Sheet {
	const sheet = sheets.find((candidate) => ruleWith(candidate, authoredClass));
	expect(sheet, `no sheet has a rule for .${authoredClass}`).toBeDefined();
	return sheet!;
}

describe('rules never leak into child components', () => {
	const twoStyled = `
export function App() @{
	<main>
		<style>.page { color: red; }</style>
		<p class="page">page</p>
		<Card />
	</main>
}

function Card() @{
	<article>
		<style>.card { color: blue; }</style>
		<p class="card">card</p>
	</article>
}
`;

	test('a second component with its own block in the same file gets its own hash class', async () => {
		const sheets = await sheetsOf(twoStyled);
		const page = sheetWith(sheets, 'page');
		const card = sheetWith(sheets, 'card');

		expect(page.scopeId).not.toBe(card.scopeId);
		expect(ruleWith(page, 'page')!.subjectClasses).toEqual(['page', page.scopeId]);
		expect(ruleWith(card, 'card')!.subjectClasses).toEqual(['card', card.scopeId]);
	});

	test('a component that is rendered by no other still gets a hash of its own', async () => {
		const sheets = await sheetsOf(`
export function First() @{
	<div><style>.first { color: red; }</style><p class="first">a</p></div>
}

export function Second() @{
	<div><style>.second { color: blue; }</style><p class="second">b</p></div>
}
`);
		expect(sheetWith(sheets, 'first').scopeId).not.toBe(sheetWith(sheets, 'second').scopeId);
	});

	test('a component with no block in a styled file adds no stylesheet', async () => {
		const result = await compile(`
export function App() @{
	<main><style>.page { color: red; }</style><Card /></main>
}

function Card() @{
	<article class="card">card</article>
}
`);
		expect(result.publicRenderPlan.styleScopes).toHaveLength(1);
	});
});

describe('a block styles its siblings and everything below them', () => {
	test('two blocks in one children list share one hash class', async () => {
		const sheets = await sheetsOf(`
export function App() @{
	<>
		<style>.one { color: red; }</style>
		<p class="one">one</p>
		<style>.two { color: blue; }</style>
		<p class="two">two</p>
	</>
}
`);
		expect(sheetWith(sheets, 'one').scopeId).toBe(sheetWith(sheets, 'two').scopeId);
	});

	test.fails('a block in an enclosing fragment and a block in an element inside it have different hash classes', async () => {
		const sheets = await sheetsOf(`
export function App() @{
	<>
		<style>.outer { color: black; }</style>
		<div class="outer">outer</div>
		<section>
			<style>.inner { font-weight: bold; }</style>
			<div class="inner">inner</div>
		</section>
	</>
}
`);
		expect(sheetWith(sheets, 'outer').scopeId).not.toBe(sheetWith(sheets, 'inner').scopeId);
	});

	test.fails('a selector that matches no element the block reaches is removed', async () => {
		const [sheet] = await sheetsOf(`
export function App() @{
	<><style>.used { color: red; } .unused { color: blue; }</style><p class="used">a</p></>
}
`);
		expect(sheet!.rules.flatMap((rule) => rule.classes)).not.toContain('unused');
	});

	test.fails('a scope whose blocks are all self-closing has no hash class of its own', async () => {
		const result = await compile(`
const base = <style>.b { color: red; }</style>;
export function App() @{
	<>
		<style apply={base} />
		<p>x</p>
	</>
}
`);
		expect(result.publicRenderPlan.diagnostics).toEqual([]);
		expect(result.publicRenderPlan.styleScopes).toHaveLength(1);
	});
});

describe('stylesheets are output in source order, outer first', () => {
	test('sibling components output their scopes in source order', async () => {
		const result = await compile(`
export function First() @{
	<div><style>.first { color: red; }</style><p class="first">a</p></div>
}

export function Second() @{
	<div><style>.second { color: blue; }</style><p class="second">b</p></div>
}
`);
		const sheets = result.publicRenderPlan.styleScopes.map((scope) =>
			readSheet(scope.scopeId, scope.cssText),
		);
		expect(sheets.map((sheet) => sheet.rules[0]!.classes[0])).toEqual(['first', 'second']);
	});

	test.fails('an outer scope is output before a nested scope even when its block is written after it', async () => {
		const result = await compile(`
export function App() @{
	<>
		<section>
			<style>.inner { color: blue; }</style>
			<p class="inner">inner</p>
		</section>
		<style>.outer { color: red; }</style>
		<p class="outer">outer</p>
	</>
}
`);
		const order = result.publicRenderPlan.styleScopes
			.map((scope) => readSheet(scope.scopeId, scope.cssText))
			.flatMap((sheet) => sheet.rules.map((rule) => rule.classes[0]));
		expect(order).toEqual(['outer', 'inner']);
	});
});

describe(':global', () => {
	test.fails(':global(...) at the start of a selector leaves that part unscoped and scopes the rest', async () => {
		const [sheet] = await sheetsOf(`
export function App() @{
	<><style>:global(.theme) .a { color: red; }</style><p class="a">a</p></>
}
`);
		const rule = ruleWith(sheet!, 'a')!;
		expect(rule.pseudoClasses).not.toContain('global');
		expect(rule.classes).toEqual(['theme', 'a', sheet!.scopeId]);
	});

	test.fails(':global(...) at the end of a selector leaves the subject unscoped', async () => {
		const [sheet] = await sheetsOf(`
export function App() @{
	<><style>.a :global(.portal) { color: red; }</style><p class="a">a</p></>
}
`);
		const rule = ruleWith(sheet!, 'portal')!;
		expect(rule.pseudoClasses).not.toContain('global');
		expect(rule.subjectClasses).toEqual(['portal']);
	});

	test.fails(':global(...) in the middle of a selector sequence is reported as TSRX3011', async () => {
		const result = await compile(`
export function App() @{
	<><style>.a :global(.b) .c { color: red; }</style><p class="a">a</p></>
}
`);
		const codes = [
			...result.publicRenderPlan.diagnostics,
			...result.semanticGraph.diagnostics,
		].map((diagnostic) => diagnostic.code);
		expect(codes).toContain('TSRX3011');
	});

	test.fails('every rule inside a :global { ... } block is unscoped', async () => {
		const [sheet] = await sheetsOf(`
export function App() @{
	<><style>:global { .g { color: pink; } }</style><p class="g">g</p></>
}
`);
		const rule = ruleWith(sheet!, 'g')!;
		expect(rule.pseudoClasses).not.toContain('global');
		expect(rule.classes).toEqual(['g']);
	});
});

describe('keyframes', () => {
	const keyframesSource = `
export function App() @{
	<>
		<style>
			@keyframes spin { from { opacity: 0; } }
			@-webkit-keyframes spin { from { opacity: 0; } }
			@keyframes -global-fade { from { opacity: 0; } }
			.a { animation: spin 1s; -webkit-animation-name: spin; }
			.b { animation-name: fade; }
		</style>
		<p class="a">a</p>
		<p class="b">b</p>
	</>
}
`;

	test.fails('a keyframe name is renamed with the block hash, in the at-rule and in animation values, vendor-prefixed forms included', async () => {
		const [sheet] = await sheetsOf(keyframesSource);
		const local = sheet!.keyframes.filter((name) => name !== 'fade');
		expect(local).toHaveLength(2);
		for (const name of local) expect(name).not.toBe('spin');
		expect(new Set(local).size).toBe(1);
		expect(sheet!.animationNames.filter((name) => name !== 'fade')).toEqual([
			local[0],
			local[0],
		]);
	});

	test.fails('a keyframe name beginning -global- is emitted without the prefix and without a hash', async () => {
		const [sheet] = await sheetsOf(keyframesSource);
		expect(sheet!.keyframes).toContain('fade');
		expect(sheet!.keyframes).not.toContain('-global-fade');
	});

	test('keyframes inside a :global block keep their names', async () => {
		const [sheet] = await sheetsOf(`
export function App() @{
	<><style>:global { @keyframes pulse { from { opacity: 0; } } }</style><p>a</p></>
}
`);
		expect(sheet!.keyframes).toEqual(['pulse']);
	});

	test('a selector that uses a global keyframe name stays scoped', async () => {
		const [sheet] = await sheetsOf(keyframesSource);
		expect(ruleWith(sheet!, 'b')!.subjectClasses).toEqual(['b', sheet!.scopeId]);
	});
});

describe('attributes, assigned blocks and apply', () => {
	test.fails('an assigned block is a theme: it compiles to a stylesheet and evaluates to an object with $class', async () => {
		const result = await compile(`
const theme = <style>.dark { color: purple; }</style>;
export function App() @{
	<p class={theme.dark}>x</p>
}
`);
		expect(result.publicRenderPlan.diagnostics).toEqual([]);
		expect(result.publicRenderPlan.styleScopes).toHaveLength(1);
	});

	test.fails('a self-closing block carries apply and adds no stylesheet of its own', async () => {
		const result = await compile(`
const base = <style>div { color: red; }</style>;
export function App() @{
	<>
		<style apply={base} />
		<div>x</div>
	</>
}
`);
		expect(result.publicRenderPlan.diagnostics).toEqual([]);
		expect(
			result.publicRenderPlan.styleScopes.map(
				(scope) => readSheet(scope.scopeId, scope.cssText).rules.length,
			),
		).toEqual([1]);
	});

	test.fails('a scoped block admits only ref and apply: any other attribute is an error', async () => {
		const result = await compile(`
export function App() @{
	<><style media="print">.a { color: red; }</style><p class="a">a</p></>
}
`);
		const errors = [
			...result.publicRenderPlan.diagnostics,
			...result.semanticGraph.diagnostics,
		].filter((diagnostic) => diagnostic.severity === 'error');
		expect(errors).not.toEqual([]);
	});

	test.fails('ref on a scoped block receives the class map of its scope', async () => {
		const result = await compile(`
export function App() @{
	let styles;
	<>
		<style ref={styles}>.card { color: red; }</style>
		<p class={styles.card}>x</p>
	</>
}
`);
		expect(result.publicRenderPlan.diagnostics).toEqual([]);
		const errors = result.semanticGraph.diagnostics.filter(
			(diagnostic) => diagnostic.severity === 'error',
		);
		expect(errors).toEqual([]);
		expect(result.renderData.chunks.flatMap((chunk) => chunk.slots)).toEqual([]);
	});
});

describe('styles outside the scope model', () => {
	test.fails('a style element inside <head> is not scoped', async () => {
		const result = await compile(`
export function App() @{
	<html>
		<head><style>.a { color: red; }</style></head>
		<body><p class="a">a</p></body>
	</html>
}
`);
		expect(result.publicRenderPlan.styleScopes).toEqual([]);
	});

	test.fails('a style element with href is not scoped', async () => {
		const result = await compile(`
export function App() @{
	<>
		<style href="theme" precedence="default">.a { color: red; }</style>
		<p class="a">a</p>
	</>
}
`);
		expect(result.publicRenderPlan.styleScopes).toEqual([]);
	});

	test('<style>{css}</style> is an ordinary element: no stylesheet, no hash class, no diagnostic', async () => {
		const result = await compile(`
const css = '.a { color: red; }';
export function App() @{
	<><style>{css}</style><p class="a">a</p></>
}
`);
		expect(result.publicRenderPlan.diagnostics).toEqual([]);
		expect(result.publicRenderPlan.styleScopes).toEqual([]);
	});

	test('a block that sits in no component markup is an error', async () => {
		const result = await compile(`
<style>.a { color: red; }</style>;
export function App() @{
	<p class="a">a</p>
}
`);
		expect(
			result.publicRenderPlan.diagnostics.filter(
				(diagnostic) => diagnostic.severity === 'error',
			),
		).not.toEqual([]);
	});
});
