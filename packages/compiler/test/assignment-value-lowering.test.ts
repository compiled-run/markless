import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function handlerSources(body: string) {
	const result = await compileTsrxModule({
		filename: 'src/Assign.tsrx',
		source: `
import { state } from '@markless/core';
import { keep } from './keep.ts';

export default function Assign() @{
	let count = state(0);
	let other = state(0);
	let label = state<string | null>(null);
	const list = state<number[]>([]);

	<main>
		<button onClick={${body}}>go</button>
		<p>{\`\${count} \${other} \${label} \${list.length}\`}</p>
	</main>
}
`,
		symbols: [],
	});
	expect(result.semanticGraph.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);
	return result.symbolModules.modules
		.filter((module) => module.kind === 'event-handler')
		.map((module) => module.source)
		.join('\n');
}

const answersNext = (graphNodeId: string) =>
	`context.graph.update({ graphNodeId: "${graphNodeId}", path: [], returnValue: "next"`;
const writes = (graphNodeId: string, value: string) =>
	`context.graph.write({ graphNodeId: "${graphNodeId}", path: [], value: ${value} })`;

test('an assignment passed as an argument lowers in place, where the write answers its value', async () => {
	const source = await handlerSources(`() => keep('count', (count = 5))`);
	expect(source).toContain(`keep('count', ${writes('state:count', '5')})`);
});

test('compound, nullish, chained and conditioned assignments each lower where their value is read', async () => {
	const source = await handlerSources(`() => {
		keep('a', (count += 2));
		keep('b', (label ??= 'set'));
		keep('c', (other = count = 7));
		if ((count = 3) > 1) keep('d', 1);
		list.push((count = 9));
		return (count -= 1);
	}`);
	expect(source).toContain(`keep('a', ${answersNext('state:count')}`);
	expect(source).toContain(`keep('b', ${answersNext('state:label')}`);
	expect(source).toContain(`keep('c', ${writes('state:other', writes('state:count', '7'))})`);
	expect(source).toContain(`if (${writes('state:count', '3')} > 1)`);
	expect(source).toContain(`args: [${writes('state:count', '9')}]`);
	expect(source).toContain(`return ${answersNext('state:count')}`);
});

test('the updater parameter never shadows a local the assigned value reads', async () => {
	const source = await handlerSources(`() => { const value = 4; keep('v', (count += value)); }`);
	expect(source).toContain('update(value1) {\n    return value1 + value;');
});
