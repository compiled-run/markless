import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

// Defect 101: a plain `else` after an @if arm is not a parse error. TSRX reads
// it as a JSXText sibling (" else ") plus a JSXExpressionContainer holding the
// swallowed body, so the @if keeps a single arm and the page renders the word
// "else" followed by the arm's own source as escaped text. The refusal is
// anchored on the preceding sibling so ordinary prose stays clean.

const ELSE_CODE = 'MARKLESS_BRANCH_ELSE_SPELLING';

async function compile(source: string) {
	return await compileTsrxModule({
		filename: 'src/Branch.tsrx',
		source,
		buildId: 'test-build',
		resolverId: 'test-resolver',
		symbols: [],
	});
}

const wrap = (body: string) => `import { state } from '@markless/core';

export function Branch() @{
	let open = state(false);
	<main>
${body}
	</main>
}`;

const plainElse = wrap(`		@if (open) {
			<p>shown</p>
		} else {
			<p>hidden</p>
		}`);

const plainElseOwnLine = wrap(`		@if (open) {
			<p>shown</p>
		}
		else {
			<p>hidden</p>
		}`);

const plainElseUnbraced = wrap(`		@if (open) {
			<p>shown</p>
		} else <p>hidden</p>`);

const plainElseIf = wrap(`		@if (open) {
			<p>shown</p>
		} else if (open) {
			<p>other</p>
		}`);

const atElse = wrap(`		@if (open) {
			<p>shown</p>
		} @else {
			<p>hidden</p>
		}`);

const atElseIfChain = wrap(`		@if (open) {
			<p>a</p>
		} @else if (open) {
			<p>b</p>
		} @else {
			<p>c</p>
		}`);

const strayAtElse = wrap(`		@else {
			<p>hidden</p>
		}`);

const proseElseElement = wrap('\t\t<p>else</p>');

const proseElseAfterArm = wrap(`		@if (open) {
			<p>shown</p>
		}
		else, sign in.`);

test('a plain `else` after an @if arm refuses with the branch-spelling code', async () => {
	const result = await compile(plainElse);

	expect(result.semanticGraph.diagnostics).toEqual(
		expect.arrayContaining([expect.objectContaining({ code: ELSE_CODE, severity: 'error' })]),
	);
});

test('the refusal names @else and @else if as the fix', async () => {
	const result = await compile(plainElse);
	const diagnostic = result.semanticGraph.diagnostics.find((entry) => entry.code === ELSE_CODE);

	expect(diagnostic).toBeDefined();
	expect(diagnostic?.suggestions.map((suggestion) => suggestion.message).join('\n')).toContain(
		'@else {',
	);
	expect(diagnostic?.suggestions.map((suggestion) => suggestion.message).join('\n')).toContain(
		'@else if (condition)',
	);
	// The span points at the stray text, not at the whole component.
	expect(diagnostic?.primarySpan?.filename).toBe('src/Branch.tsrx');
});

test.each([
	['on its own line', plainElseOwnLine],
	['without braces', plainElseUnbraced],
])('a plain `else` written %s refuses too', async (_label, source) => {
	const result = await compile(source);

	expect(result.semanticGraph.diagnostics).toEqual(
		expect.arrayContaining([expect.objectContaining({ code: ELSE_CODE, severity: 'error' })]),
	);
});

test('a plain `else if` refuses with the branch-spelling code', async () => {
	const result = await compile(plainElseIf);

	expect(result.semanticGraph.diagnostics).toEqual(
		expect.arrayContaining([expect.objectContaining({ code: ELSE_CODE, severity: 'error' })]),
	);
});

test('a stray @else with no @if stays a parse error', async () => {
	const result = await compile(strayAtElse);

	expect(collectTsrxModuleDiagnostics(result)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ code: 'MARKLESS_PARSE_ERROR', severity: 'error' }),
		]),
	);
});

test('the @else spelling still compiles clean', async () => {
	const result = await compile(atElse);

	expect(collectTsrxModuleDiagnostics(result).filter((entry) => entry.severity === 'error')).toEqual(
		[],
	);
});

test('the @else if chain spelling is never read as a mis-spelled else', async () => {
	const result = await compile(atElseIfChain);

	// The chain lowers to a nested JSXIfExpression, so it must not trip the
	// sibling-anchored predicate. Other arm diagnostics are out of scope here.
	expect(collectTsrxModuleDiagnostics(result).filter((entry) => entry.code === ELSE_CODE)).toEqual(
		[],
	);
});

test.each([
	['<p>else</p> prose', proseElseElement],
	['prose starting with "else" after an arm', proseElseAfterArm],
])('%s stays clean', async (_label, source) => {
	const result = await compile(source);

	expect(result.semanticGraph.diagnostics.filter((entry) => entry.code === ELSE_CODE)).toEqual([]);
});

test('the refusal makes the module unserveable, so nothing is emitted to ship', async () => {
	const blocked = await compile(plainElse);
	const clean = await compile(atElse);

	// The bundler turns an error-severity diagnostic into MARKLESS_COMPILE_BLOCKED,
	// and the compiler's half of that contract is emitting no render module at
	// all, so the visible garbage can never reach a host. The clean spelling
	// shows the same fields do carry the arm markup when nothing is refused.
	expect(collectTsrxModuleDiagnostics(blocked).filter((entry) => entry.severity === 'error')).toEqual(
		expect.arrayContaining([expect.objectContaining({ code: ELSE_CODE })]),
	);
	expect(blocked.publicRenderModule.renderDataModuleSource).toBe('');
	expect(blocked.publicRenderModule.ssrModuleSource).toBe('');
	expect(clean.publicRenderModule.renderDataModuleSource).toContain('hidden');
});
