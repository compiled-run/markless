import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { parseModule } from '../src/js-ast.ts';
import { emitClientResidueReaderPrelude } from '../src/passes/public-render/residue-reader.ts';

function importNames(source: string) {
	return parseModule(source, 'prelude.ts').body.flatMap((node) =>
		node.type === 'ImportDeclaration' ? node.specifiers.map((entry) => entry.local.name) : [],
	);
}

test.each([
	{
		name: 'Label',
		tag: 'aside',
		ghost: 'phantom',
		helper: 'format',
		dead: 'unused',
		reverse: false,
	},
	{
		name: 'Notice',
		tag: 'section',
		ghost: 'specter',
		helper: 'decorate',
		dead: 'forgotten',
		reverse: true,
	},
])(
	'residue prelude retains only executable dependencies for $name',
	async ({ name, tag, ghost, helper, dead, reverse }) => {
		const declarations = [
			`const ${dead} = ${ghost}('never');`,
			`const example = 'import { ${ghost} } from "library"; ${dead}';`,
			`function caption(value) { return ${helper}(value); }`,
		];
		if (reverse) declarations.reverse();
		const result = await compileTsrxModule({
			filename: `/dependency-${name}.tsrx`,
			symbols: [],
			source: `import { ${ghost}, ${helper} } from './helpers';
		${declarations.join('\n')}
		export function ${name}({ label }) @{
			const local = caption(label) + example + '[data-${ghost}]';
			<${tag} title={local} />
		}`,
		});
		const definition = result.publicRenderModule.componentDefinitions.find(
			(entry) => entry.name === name,
		)!;
		const imports = definition.residueReaderImports as Array<{ line: string }>;
		const prelude = (definition.residueReaderDeclarations as string[]).join('\n');
		expect(importNames(imports.map((entry) => entry.line).join('\n'))).toEqual([helper]);
		expect(
			parseModule(prelude, 'prelude.ts').body.flatMap((node) =>
				node.type === 'VariableDeclaration'
					? node.declarations.map((entry) =>
							entry.id.type === 'Identifier' ? entry.id.name : null,
						)
					: [],
			),
		).toEqual(['example']);
		const reader = new Function(
			helper,
			`${prelude}; return (${definition.residueReaderSource});`,
		)((text: string) => text.toUpperCase());
		for (const value of ['one', 'two']) {
			const rendered = reader({ source: 'local' }, { read: () => value });
			expect(rendered).toBe(
				`${value.toUpperCase()}import { ${ghost} } from "library"; ${dead}[data-${ghost}]`,
			);
		}
	},
);

test.each([
	`label + '[data-ghost]'`,
	'`${label} ghost`',
	`label + /ghost/.source`,
	`label /* ghost */ + '!'`,
	`({ ghost: label }).ghost`,
	`({ value: label } as ghost).value`,
	`((ghost) => ghost(label))((value) => value)`,
])('non-value names do not create runtime imports: %s', async (expression) => {
	const result = await compileTsrxModule({
		filename: '/non-value.tsrx',
		symbols: [],
		source: `import { ghost } from './unused'; export function Text({ label }) @{ <p title={${expression}} /> }`,
	});
	const definition = result.publicRenderModule.componentDefinitions.find(
		(entry) => entry.name === 'Text',
	)!;
	expect(definition.residueReaderImports ?? []).toEqual([]);
});

test.each([
	{ expression: '`${live(label)}`', expected: 'OK' },
	{ expression: '({ live }).live(label)', expected: 'OK' },
	{ expression: 'Object.keys({ [live(label)]: label })[0]', expected: 'OK' },
	{ expression: 'make(label).value', expected: 'OK' },
	{ expression: 'make().value', expected: 'DEFAULT' },
	{ expression: 'new Field().value', expected: 'FIELD' },
])(
	'value references retain transitive runtime dependencies: $expression',
	async ({ expression, expected }) => {
		const result = await compileTsrxModule({
			filename: '/value.tsrx',
			symbols: [],
			source: `import { live } from './live';
	class Box { value; constructor(value = live('default')) { this.value = live(value); } }
	class Field { value = live('field'); }
	function make(value) { return new Box(value); }
	export function Text({ label }) @{ <p title={${expression}} /> }`,
		});
		const definition = result.publicRenderModule.componentDefinitions.find(
			(entry) => entry.name === 'Text',
		)!;
		expect(
			importNames(
				(definition.residueReaderImports as Array<{ line: string }>)
					.map((entry) => entry.line)
					.join('\n'),
			),
		).toEqual(['live']);
		const reader = new Function(
			'live',
			`${(definition.residueReaderDeclarations as string[] | undefined)?.join('\n') ?? ''}; return (${definition.residueReaderSource});`,
		)((text: string) => text.toUpperCase());
		expect(reader({ source: expression }, { read: () => 'ok' })).toBe(expected);
	},
);

test('component-local shadowing and separate residue expressions do not leak dependencies', async () => {
	const result = await compileTsrxModule({
		filename: '/scopes.tsrx',
		symbols: [],
		source: `import { ghost, label } from './unused';
	export function First({ input }) @{
		const label = input + '!';
		<p title={label} data-other={{ ghost: input }.ghost} />
	}
	export function Second({ other }) @{
		const label = ghost('unused');
		<aside title={other + '?'} />
	}`,
	});
	for (const definition of result.publicRenderModule.componentDefinitions)
		expect(definition.residueReaderImports ?? []).toEqual([]);
});

test('unreadable residue analysis retains a conservative dependency set', async () => {
	const source = {
		filename: '/failure.tsrx',
		symbols: [],
		source: `import { ghost } from './helpers'; const fallback = ghost(); export function Text({ label }) @{ <p title={label + '!'} /> }`,
	};
	const result = await compileTsrxModule(source);
	const renderData = {
		...result.renderData,
		chunks: result.renderData.chunks.map((chunk) => ({
			...chunk,
			slots: chunk.slots.map((slot) =>
				'residue' in slot && slot.residue.kind === 'authored-expression'
					? { ...slot, residue: { ...slot.residue, source: 'label +' } }
					: slot,
			),
		})),
	};
	const prelude = emitClientResidueReaderPrelude({ ...result, source, renderData }, ['Text']);
	expect(importNames(prelude.imports.map((entry) => entry.line).join('\n'))).toEqual(['ghost']);
	expect(prelude.declarations).toContain('const fallback = ghost();');
});

test('repeat bindings do not hide module references outside the repeat', async () => {
	const result = await compileTsrxModule({
		filename: '/repeat-shadow.tsrx',
		symbols: [],
		source: `import { row } from './live';
		export function List({ rows, label }) @{
			<section title={row(label)}>@for (const row of rows; key row.id) { <p>{row.label}</p> }</section>
		}`,
	});
	const definition = result.publicRenderModule.componentDefinitions.find(
		(entry) => entry.name === 'List',
	)!;
	expect(
		importNames(
			(definition.residueReaderImports as Array<{ line: string }>)
				.map((entry) => entry.line)
				.join('\n'),
		),
	).toEqual(['row']);
});

test('component locals do not shadow imports used inside module helpers', async () => {
	const result = await compileTsrxModule({
		filename: '/helper-shadow.tsrx',
		symbols: [],
		source: `import { format } from './live';
		function caption(value) { return format(value); }
		export function Label({ value }) @{
			const format = value + '!';
			<p title={caption(format)} />
		}`,
	});
	const definition = result.publicRenderModule.componentDefinitions.find(
		(entry) => entry.name === 'Label',
	)!;
	expect(
		importNames(
			(definition.residueReaderImports as Array<{ line: string }>)
				.map((entry) => entry.line)
				.join('\n'),
		),
	).toEqual(['format']);
	const reader = new Function(
		'format',
		`${(definition.residueReaderDeclarations as string[]).join('\n')}; return (${definition.residueReaderSource});`,
	)((text: string) => text.toUpperCase());
	expect(reader({ source: 'caption(format)' }, { read: () => 'ready' })).toBe('READY!');
});
