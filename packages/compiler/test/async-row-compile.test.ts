import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { resolveBoundaryRunners } from '../src/passes/public-render/boundary-runner.ts';

async function compile(source: string) {
	const result = await compileTsrxModule({ filename: 'src/page.tsrx', symbols: [], source });
	return {
		result,
		errors: [
			...result.semanticGraph.diagnostics,
			...result.publicRenderPlan.diagnostics,
			...result.publicRenderModule.diagnostics,
			...result.symbolModules.diagnostics,
		].filter((diagnostic) => diagnostic.severity === 'error'),
	};
}

for (const [shape, collection] of [
	['a filter call', 'inbox.filter((message) => message.subject.includes(query))'],
	['a slice call', 'inbox.slice(0, limit)'],
] as const) {
	test(`a @for over ${shape} on an async value inside @try settles on that value`, async () => {
		const { result, errors } = await compile(`import { computed, state } from '@markless/core';
import { getInbox } from './api.ts';

export default function Page() @{
	let query = state('');
	let limit = state(2);
	const inbox = computed(async () => await getInbox());

	<main>
		<input value={query} onInput={(event) => (query = event.currentTarget.value)} />
		<button onClick={() => limit++}>more</button>
		@try {
			<ul>
				@for (const message of ${collection}; key message.id) {
					<li>{message.subject}</li>
				}
			</ul>
		} @pending {
			<p>loading</p>
		}
	</main>
}
`);
		expect(errors).toEqual([]);
		expect(resolveBoundaryRunners(result.semanticGraph).get('boundary:0')?.runnerGraphNodeId).toBe(
			'computed:inbox',
		);
	});
}

const tryRoot = `@try {
		<p>{detail.text}</p>
	} @pending {
		<p>Loading</p>
	}`;

function child(name: string, template: string) {
	return `export function ${name}({ topic }: { topic: string }) @{
	const detail = computed(async () => await getDetail(topic));

	${template}
}`;
}

async function rowErrors(input: { readonly child: string; readonly row: string; readonly sameFile?: boolean }) {
	const page = (imports: string, local: string) => `import { computed, state } from '@markless/core';
import { getDetail } from './api.ts';
${imports}
${local}
export default function Page() @{
	let topic = state('a');

	<main>
		<button onClick={() => (topic = 'b')}>b</button>
		@for (const chosen of [topic]; key chosen) {
			${input.row}
		}
	</main>
}
`;
	if (input.sameFile) return (await compile(page("", input.child))).errors;
	const childModule = await compileTsrxModule({
		filename: 'src/detail.tsrx',
		symbols: [],
		source: `import { computed } from '@markless/core';
import { getDetail } from './api.ts';

${input.child}
`,
	});
	const result = await compileTsrxModule({
		filename: 'src/page.tsrx',
		symbols: [],
		source: page(`import { Detail } from './detail.tsrx';`, ''),
		importedModuleInterfaces: { './detail.tsrx': childModule.moduleGraphInterface },
	});
	return [
		...result.semanticGraph.diagnostics,
		...result.publicRenderPlan.diagnostics,
		...result.publicRenderModule.diagnostics,
		...result.symbolModules.diagnostics,
	].filter((diagnostic) => diagnostic.severity === 'error');
}

for (const sameFile of [false, true]) {
	const where = sameFile ? 'a same-file' : 'an imported';
	test(`a @for row that is ${where} component whose template is a bare @try says the row is not one element`, async () => {
		const errors = await rowErrors({
			child: child('Detail', tryRoot),
			row: '<Detail topic={chosen} />',
			sameFile,
		});
		expect([...new Set(errors.map((error) => error.code))]).toEqual(['MARKLESS_KEYED_REPEAT_ROW_NOT_ONE_ELEMENT']);
		expect(errors[0]!.message).toContain('<Detail>');
	});

	test(`a @for row that is ${where} component with an element around its @try builds`, async () => {
		const errors = await rowErrors({
			child: child('Detail', `<article>\n\t${tryRoot}\n\t</article>`),
			row: '<Detail topic={chosen} />',
			sameFile,
		});
		expect(errors).toEqual([]);
	});

	test(`a @for row that wraps ${where} bare-@try component in an element builds`, async () => {
		const errors = await rowErrors({
			child: child('Detail', tryRoot),
			row: '<div><Detail topic={chosen} /></div>',
			sameFile,
		});
		expect(errors).toEqual([]);
	});
}

test('a page value reads its own state, not a same-file child prop of the same name', async () => {
	const { result, errors } = await compile(`import { computed, state } from '@markless/core';
import { getDetail } from './api.ts';

function Detail({ range }: { range: string }) @{
	const detail = computed(async () => await getDetail(range));

	<section>
		@try {
			<p>{detail.text}</p>
		} @pending {
			<p>Loading</p>
		}
	</section>
}

export default function Page() @{
	let range = state('7d');

	<main>
		<button aria-pressed={range === '30d'} onClick={() => (range = '30d')}>{range}</button>
		<ul>
			@for (const chosen of [range]; key chosen) {
				<li>{chosen}</li>
			}
		</ul>
		<Detail range={range} />
	</main>
}
`);
	expect(errors).toEqual([]);
	const pageValues = result.semanticGraph.graphBindings.filter(
		(binding) => binding.componentName === 'Page' && binding.id.startsWith('computed:templateExpression:'),
	);
	expect(pageValues.length).toBeGreaterThan(0);
	for (const value of pageValues)
		expect(value.dependencies?.map((dependency) => dependency.graphNodeId)).toEqual(['state:range']);
});
