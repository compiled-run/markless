import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A child handler reading a prop needs the value in the browser after resume; a `const`
// in the parent's body whose initializer is constant data is known at build time.
async function compile(declaration: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/page.tsrx',
		source: `import { state } from '@markless/core';
function Say({ word }: { readonly word: string }) @{
	let said = state('');
	<button onClick={() => (said = word)}>{said}</button>
}
export default function Page({ name }: { readonly name: string }) @{
	${declaration}
	<main><Say word={greeting} /></main>
}
`,
		symbols: [],
	});
	const edge = compiled.semanticGraph.componentEdges.find(
		(candidate) => candidate.childComponentName === 'Say',
	);
	return {
		prop: edge?.props.find((prop) => prop.name === 'word'),
		diagnostics: [
			...compiled.semanticGraph.diagnostics,
			...compiled.captureAnalysis.diagnostics,
		].map((diagnostic) => diagnostic.code),
	};
}

test('a body const string reaches the child as its build-time value', async () => {
	const { prop, diagnostics } = await compile(`const greeting = 'hello';`);
	expect(prop).toMatchObject({ kind: 'opaque', buildTimeValue: { value: 'hello' } });
	expect(diagnostics).not.toContain('MARKLESS_CAPTURE_OPAQUE_PROP');
});

test('a body const read from another body const is still constant', async () => {
	const { prop } = await compile(`const words = { hi: 'hello' }; const greeting = words.hi;`);
	expect(prop).toMatchObject({ buildTimeValue: { value: 'hello' } });
});

test('a body const that reads a prop is not constant and is still refused', async () => {
	const { prop, diagnostics } = await compile(`const greeting = name + '!';`);
	expect(prop).not.toHaveProperty('buildTimeValue');
	expect(diagnostics).toContain('MARKLESS_CAPTURE_OPAQUE_PROP');
});
