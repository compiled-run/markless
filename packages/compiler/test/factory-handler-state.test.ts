import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function errorsOf(source: string) {
	const result = await compileTsrxModule({ filename: 'src/page.tsrx', symbols: [], source });
	return [
		...result.semanticGraph.diagnostics,
		...result.captureAnalysis.diagnostics,
		...result.publicRenderPlan.diagnostics,
		...result.publicRenderModule.diagnostics,
		...result.symbolModules.diagnostics,
	].filter((diagnostic) => diagnostic.severity === 'error');
}

const button = `function Button({ onClick, children }: { onClick: () => void; children?: unknown }) @{
	<button onClick={onClick}>{children}</button>
}`;

function page(input: {
	readonly module?: string;
	readonly body: string;
	readonly handler: string;
	readonly tag?: 'button' | 'Button';
}) {
	const tag = input.tag ?? 'button';
	return `import { state } from '@markless/core';
${input.module ?? ''}

${button}

export default function Ledger() @{
	let total = state(0);
	${input.body}
	<main>
		<${tag} onClick={${input.handler}}>Add</${tag}>
		<p>{total}</p>
	</main>
}
`;
}

// Handler body consts are rebuilt on every event, so a stateful factory's result would restart each click.
const stateful = {
	closureCounter: {
		body: `const makeCounter = () => { let count = 0; return () => { count += 1; total = count; }; };\n\tconst handler = makeCounter();`,
		handler: '() => handler()',
	},
	functionDeclaration: {
		body: `function makeTally(step: number) { let seen = 0; return (event?: Event) => { seen += step; total = seen + (event ? 0 : 1); }; }\n\tconst bump = makeTally(2);`,
		handler: '(event) => bump(event)',
	},
	moduleFactory: {
		module: `const tallyFrom = (start: number) => { let at = start; return () => { at += 1; return at; }; };`,
		body: `const next = tallyFrom(10);`,
		handler: '() => { total = next(); }',
	},
	importedFactory: {
		module: `import { makeCounter } from './counters.ts';`,
		body: `const tick = makeCounter();`,
		handler: '() => { total = tick(); }',
	},
};

for (const tag of ['button', 'Button'] as const)
	for (const [name, shape] of Object.entries(stateful))
		test(`an inline handler calling a factory-made function fails with the reason and a rewrite (${name}, <${tag}>)`, async () => {
			const errors = await errorsOf(page({ ...shape, tag }));
			expect(errors.length).toBeGreaterThan(0);
			const local = /const (\w+) = \w+\(/.exec(shape.body)![1]!;
			for (const error of errors) {
				expect(error.why).toContain(`\`${local}\``);
				expect(error.why).toMatch(/does more than return a function|not declared in this file/);
				expect(error.why).toContain('on every event');
				expect(
					error.suggestions?.map((suggestion) => suggestion.message).join('\n'),
				).toContain('state()');
			}
		});

const stateless = {
	pureFactory: {
		body: `const makeAdd = (step: number) => () => { total = total + step; };\n\tconst add = makeAdd(3);`,
		handler: '() => add()',
	},
	returnOnlyFactory: {
		body: `function makeAdd(step: number) { return () => { total = total + step; }; }\n\tconst add = makeAdd(3);`,
		handler: '(event) => { event.stopPropagation(); add(); }',
	},
	computedValue: {
		module: `const double = (value: number) => value * 2;`,
		body: `const step = double(2);`,
		handler: '() => { total = total + step; }',
	},
};

for (const tag of ['button', 'Button'] as const)
	for (const [name, shape] of Object.entries(stateless))
		test(`an inline handler over a factory that only returns a function compiles (${name}, <${tag}>)`, async () => {
			expect((await errorsOf(page({ ...shape, tag }))).map((error) => error.message)).toEqual([]);
		});
