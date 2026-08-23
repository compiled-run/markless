import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	collectTsrxModuleDiagnostics,
	compileTsrxModule,
} from '../src/index.ts';

const boundSource = `
import { shared, state } from '@markless/core';

export const krs = shared(() => {
	const data = state({ open: false });
	return { ...data };
});

export function Widget() @{
	const group = krs();

	<main>
		<span>{group.open}</span>
	</main>
}
`;

const bareSource = `
import { shared, state } from '@markless/core';

export const krs = shared(() => {
	const data = state({ open: false });
	return { ...data };
});

export function Widget() @{
	krs();

	<main>
		<span>hi</span>
	</main>
}
`;

async function graphOf(source: string) {
	return buildSemanticGraph({ filename: 'src/page.tsrx', source });
}

async function compile(source: string) {
	return compileTsrxModule({
		filename: 'src/page.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

// Defect 69. A shared call whose result is discarded used to compile: CSR
// dropped it, and SSR emitted the call verbatim into the render prelude, where
// it hit the bundler's fail-closed export and threw
// MARKLESS_SHARED_CALL_UNCOMPILED at render time. Nothing an author can read
// comes from an unbound call — every read resolves through the local name — so
// the build refuses it instead of shipping two disagreeing modes.
test('an unbound shared call is refused at compile time', async () => {
	const graph = await graphOf(bareSource);
	const callStart = bareSource.indexOf('krs();');

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_SHARED_CALL_UNBOUND',
			severity: 'error',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			source: 'krs',
			primarySpan: {
				filename: 'src/page.tsrx',
				start: callStart,
				end: callStart + 'krs()'.length,
			},
		}),
	]);
	expect(graph.diagnostics[0]?.message).toContain('krs');
});

test('the refusal tells the author to bind the call', async () => {
	const graph = await graphOf(bareSource);
	const suggestions = graph.diagnostics[0]?.suggestions ?? [];

	expect(suggestions.length).toBeGreaterThan(0);
	expect(suggestions.map((suggestion) => suggestion.message).join('\n')).toContain('const');
});

// The split itself is the defect: whatever the compiler decides, both modes have
// to decide it the same way.
test('CSR and SSR agree: neither mode emits an unbound shared call', async () => {
	const compiled = await compile(bareSource);

	expect(
		collectTsrxModuleDiagnostics(compiled).some(
			(diagnostic) =>
				diagnostic.code === 'MARKLESS_SHARED_CALL_UNBOUND' && diagnostic.severity === 'error',
		),
	).toBe(true);
	const emitted = [
		compiled.publicRenderModule.moduleSource,
		compiled.publicRenderModule.ssrModuleSource,
	].join('\n');
	expect(emitted).not.toMatch(/(^|[^\w$.])krs\s*\(/);
});

// The refusal has to be about the discarded result, not about shared() itself.
test('a bound shared call is untouched', async () => {
	const graph = await graphOf(boundSource);
	expect(
		graph.diagnostics.filter((diagnostic) => diagnostic.code === 'MARKLESS_SHARED_CALL_UNBOUND'),
	).toEqual([]);

	const compiled = await compile(boundSource);
	expect(
		collectTsrxModuleDiagnostics(compiled).filter(
			(diagnostic) => diagnostic.code === 'MARKLESS_SHARED_CALL_UNBOUND',
		),
	).toEqual([]);
	const emitted = [
		compiled.publicRenderModule.moduleSource,
		compiled.publicRenderModule.ssrModuleSource,
	].join('\n');
	expect(emitted).not.toMatch(/(^|[^\w$.])krs\s*\(/);
});

// An ordinary discarded call is not a shared call and stays the author's code.
test('a plain discarded call is not refused', async () => {
	const graph = await graphOf(`
import { shared, state } from '@markless/core';

export const krs = shared(() => {
	const data = state({ open: false });
	return { ...data };
});

function track(name: string) {
	console.log(name);
}

export function Widget() @{
	const group = krs();
	track('mounted');

	<main>
		<span>{group.open}</span>
	</main>
}
`);

	expect(
		graph.diagnostics.filter((diagnostic) => diagnostic.code === 'MARKLESS_SHARED_CALL_UNBOUND'),
	).toEqual([]);
});
