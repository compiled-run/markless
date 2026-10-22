import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A row renders from its item alone, and a nested `@{ ... }` has no body of its own in
// the render either, so each slot reading a `const` declared in one carries that
// const's definition instead.
async function compile(source: string) {
	const result = await compileTsrxModule({ filename: 'src/nested.tsrx', source, symbols: [] });
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result;
}

function authoredResidues(chunk: { readonly slots: ReadonlyArray<object> }) {
	return chunk.slots.flatMap((slot) =>
		'residue' in slot &&
		(slot.residue as { kind: string }).kind === 'authored-expression' &&
		'kind' in slot
			? [{ kind: slot.kind as string, source: (slot.residue as { source: string }).source }]
			: [],
	);
}

for (const [list, item, local, wide, tag] of [
	['items', 'item', 'label', 'width', 'li'],
	['people', 'person', 'greeting', 'size', 'p'],
] as const)
	test(`a ${tag} row reading \`${local}\` from its @for body evaluates from \`${item}\` alone`, async () => {
		const result = await compile(`import { state } from '@markless/core';
const UNIT = 'px';
export function Rows() @{
	let ${list} = state([{ id: 1, name: 'pear', qty: 2 }]);
	<section>
		@for (const ${item} of ${list}; key ${item}.id) {
			const ${local} = \`\${${item}.name} x\${${item}.qty}\`;
			const ${wide} = ${item}.qty * 10 + UNIT;
			<${tag} title={${local}} data-width={${wide}}>{${local}}</${tag}>
		}
	</section>
}
`);
		const row = result.renderData.chunks.find((chunk) => chunk.kind === 'repeat-row')!;
		const residues = authoredResidues(row);
		expect(residues.map((residue) => residue.kind).sort()).toEqual([
			'attribute',
			'attribute',
			'text',
		]);
		const values = residues.map((residue) =>
			new Function(item, 'UNIT', `return (${residue.source});`)(
				{ id: 1, name: 'fig', qty: 3 },
				'px',
			),
		);
		expect(values.sort()).toEqual(['30px', 'fig x3', 'fig x3']);
	});

for (const [first, second, tag, cell] of [
	['greeting', 'doubled', 'p', 'count'],
	['heading', 'twice', 'span', 'clicks'],
] as const)
	test(`a nested @{ } among children renders its <${tag}> from its own consts`, async () => {
		const result = await compile(`import { state } from '@markless/core';
export function Note() @{
	let ${cell} = state(1);
	<section>
		<h2>Title</h2>
		@{
			const ${first} = 'hello';
			const ${second} = ${cell} * 2;
			<${tag} title={${first}} onClick={() => ${cell}++}>{${first}} {${second}}</${tag}>
		}
	</section>
}
`);
		const template = result.renderData.chunks.find((chunk) => chunk.kind === 'template')!;
		expect(template.statics.join('')).toContain(`<h2>Title</h2><${tag}`);
		const values = authoredResidues(template).map((residue) =>
			new Function(cell, `return (${residue.source});`)(5),
		);
		expect(values).toEqual(['hello', 'hello', 10]);
		expect(result.symbolModules.modules.map((module) => module.kind)).toContain(
			'event-handler',
		);
	});
