import { expect, test } from 'vitest';
import ts from 'typescript';
import { compileTsrxForTypeService, compile_to_volar_mappings } from '../src/type-service.ts';

test('compileTsrxForTypeService returns a Volar-shaped AST-backed type-service artifact', () => {
	const source = `import { state } from '@markless/core';
import { Row } from './Row.tsrx';

export function List({ items, emptyLabel }: { items: { id: string; tag: string; label: string; active: boolean; select(index: number): void }[]; emptyLabel: string }) @{
	let selected = state('');
	<section>
		@for (const item of items; index i; key item.id) {
			<{item.tag} class={item.active ? "on" : "off"} onClick={() => { selected = item.id; item.select(i); }}>
				<Row label={item.label}>{selected}</Row>
			</{item.tag}>
		} @empty {
			<span>{emptyLabel}</span>
		}
		<style>
			.row { color: red; }
		</style>
	</section>
}`;

	const result = compileTsrxForTypeService(source, 'List.tsrx', { loose: true });

	expect(result.sourceAst?.type).toBe('Program');
	expect(result.errors).toEqual([]);
	expect(result.code).toContain("import { state } from '@markless/core';");
	expect(result.code).toContain("import { Row } from './Row.tsrx';");
	expect(result.code).toContain('/** @jsxImportSource @markless/typescript-plugin */');
	expect(result.code).toContain('return <section>');
	expect(result.code).toContain('void (item.id)');
	expect(result.code).toContain('void (item.active ? "on" : "off")');
	expect(result.code).toContain('item.select(i)');
	expect(result.code).toContain('void (Row)');
	expect(result.code).toContain('void (selected)');
	expect(result.code).toContain('void (emptyLabel)');
	expect(result.code).not.toContain('<{item.tag}');
	expect(result.code).not.toContain('@empty');
	expect(result.mappings.length).toBeGreaterThan(0);
	expectExactMapping(result, source, 'item.active ? "on" : "off"');
	expectExactMapping(result, source, 'item.select(i)');
	expectExactMapping(result, source, 'selected');
	expectExactMapping(result, source, 'emptyLabel');
	expect(result.cssMappings[0]?.sourceOffsets).toEqual([
		source.indexOf(result.cssMappings[0]?.data?.customData?.content ?? ''),
	]);
	expect(result.cssMappings[0]?.lengths).toEqual([
		result.cssMappings[0]?.data?.customData?.content?.length,
	]);
	expect(result.cssMappings[0]?.data?.customData?.content).toContain('.row { color: red; }');
});

test('compile_to_volar_mappings aliases the Markless type-service artifact for TSRX tooling', () => {
	const source = `export function App() @{ <button onClick={() => count++}>{count}</button> }`;

	const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

	expect(result.sourceAst?.type).toBe('Program');
	expect(result.code).toContain('count++');
	expect(result.code).toContain('return <button');
	expectExactMapping(result, source, 'count++');
});

test('compileTsrxForTypeService maps TSRX control-flow expressions through generated code', () => {
	const source = `export function Control({ ready, kind, pending, message, load }: { ready: boolean; kind: 'a' | 'b'; pending: string; message: string; load(): Promise<string> }) @{
	<section>
		@if (ready && kind === 'a') {
			<span>{message}</span>
		} @else {
			<span>{pending}</span>
		}
		@switch (kind) {
			@case 'a': {
				<span>{message.toUpperCase()}</span>
			}
			@default: {
				<span>{pending}</span>
			}
		}
		@try {
			<span>{load().then(Boolean)}</span>
		} @pending {
			<span>{pending}</span>
		} @catch (error) {
			<span>{error.message}</span>
		}
	</section>
}`;

	const result = compileTsrxForTypeService(source, 'Control.tsrx', { loose: true });

	expect(result.errors).toEqual([]);
	expect(result.code).toContain("if (ready && kind === 'a')");
	expect(result.code).toContain('void (kind)');
	expect(formatParseDiagnostics(result.code)).toEqual([]);
	expect(result.code).not.toContain('@case');
	expect(result.code).toContain('return <section>');
	expectExactMapping(result, source, "ready && kind === 'a'");
	expectExactMapping(result, source, 'message.toUpperCase()');
	expectExactMapping(result, source, 'load().then(Boolean)');
	expectExactMapping(result, source, 'error.message');
});

test('compileTsrxForTypeService lowers nested statement containers and expression TSRX values', () => {
	const source = `export function Blocks({ title, value }: { title: string; value: number }) @{
	const fallback = @if (value > 0) {
		<span>{title.toUpperCase()}</span>
	} @else {
		<span>{title.toLowerCase()}</span>
	};
	<section>
		@{
			const label = title.trim();
			<span>{label}</span>
		}
		{fallback}
	</section>
}`;

	const result = compileTsrxForTypeService(source, 'Blocks.tsrx', { loose: true });

	expect(result.errors).toEqual([]);
	expect(formatParseDiagnostics(result.code)).toEqual([]);
	expect(result.code).not.toContain('@{');
	expect(result.code).not.toContain('@if');
	expect(result.code).toContain('return <section>');
	expect(result.code).toContain('const fallback =');
	expect(result.code).toContain('void (value > 0)');
	expect(result.code).toContain('const label = title.trim();');
	expectExactMapping(result, source, 'value > 0');
	expectExactMapping(result, source, 'title.toUpperCase()');
	expectExactMapping(result, source, 'title.toLowerCase()');
	expectExactMapping(result, source, 'label');
	expectExactMapping(result, source, 'fallback');
});

test('compileTsrxForTypeService preserves spread attribute expressions', () => {
	const source = `type Props = { attrs: Record<string, string>; id: string };
export function Spread({ attrs, id }: Props) @{
	<section {...attrs} data-id={id}>{id}</section>
}`;

	const result = compileTsrxForTypeService(source, 'Spread.tsrx', { loose: true });

	expect(result.errors).toEqual([]);
	expect(formatParseDiagnostics(result.code)).toEqual([]);
	expect(result.code).toContain('<section {...attrs} data-id={id}>{id}</section>');
	expectExactMapping(result, source, 'attrs');
	expectExactMapping(result, source, 'id');
});

test('compileTsrxForTypeService preserves fragments as TSX parser output', () => {
	const source = `export function Fragmented({ title, count }: { title: string; count: number }) @{
	<>
		<header>{title}</header>
		<span>{count + 1}</span>
	</>
}`;

	const result = compileTsrxForTypeService(source, 'Fragmented.tsrx', { loose: true });

	expect(result.errors).toEqual([]);
	expect(formatParseDiagnostics(result.code)).toEqual([]);
	expect(result.code).toContain('return <>');
	expect(result.code).toContain('<header>{title}</header>');
	expect(result.code).toContain('<span>{count + 1}</span>');
	expectExactMapping(result, source, 'title');
	expectExactMapping(result, source, 'count + 1');
});

test('compileTsrxForTypeService assigns ruled mapping profiles to TSX tokens and insertion gaps', () => {
	const source = `export function Mapped({ value, attrs }: { value: string; attrs: Record<string, string> }) @{
	<div class="card" title={value} {...attrs}>{value}</div>
}`;
	const result = compileTsrxForTypeService(source, 'Mapped.tsrx', { loose: true });
	const mappingFor = (text: string, from = 0) => {
		const sourceOffset = source.indexOf(text, from);
		return result.mappings.find(
			(mapping) =>
				mapping.sourceOffsets[0] === sourceOffset &&
				mapping.lengths[0] === text.length &&
				result.code.slice(
					mapping.generatedOffsets[0],
					mapping.generatedOffsets[0] + mapping.generatedLengths[0],
				) === text,
		);
	};

	expect(mappingFor('div', source.indexOf('<div'))?.data).toMatchObject({
		verification: true,
		completion: true,
		semantic: true,
		navigation: true,
		structure: true,
		format: false,
	});
	expect(mappingFor('class')?.data).toMatchObject({ verification: true, structure: true });
	expect(mappingFor('value', source.indexOf('title='))?.data).toMatchObject({
		verification: true,
		completion: true,
		semantic: true,
		navigation: true,
		structure: false,
	});
	expect(mappingFor('<', source.indexOf('<div'))?.data).toMatchObject({
		verification: false,
		completion: true,
		semantic: false,
		navigation: false,
		structure: true,
	});
	expect(mappingFor(' ', source.indexOf('<div'))?.data.verification).toBe(false);
	expect(mappingFor('"card"')?.data.structure).toBe(false);
	expect(mappingFor('card')?.data.structure).toBe(false);
});

test('compileTsrxForTypeService maps component tag names, attributes, and opening-tag insertion gaps', () => {
	const source = `import { Nav } from './Nav.tsrx';
export function App({ active }: { active: boolean }) @{
	<Nav label="Home" active={active}>content</Nav>
}`;
	const result = compileTsrxForTypeService(source, 'App.tsrx', { loose: true });
	const opening = source.indexOf('Nav label');
	const closing = source.lastIndexOf('Nav>');
	const gap = source.indexOf(' ', opening);
	const mappingAt = (offset: number, length: number) =>
		result.mappings.find(
			(mapping) => mapping.sourceOffsets[0] === offset && mapping.lengths[0] === length,
		);

	expect(mappingAt(opening, 3)?.data).toMatchObject({
		verification: true,
		completion: true,
		navigation: true,
		structure: true,
	});
	expect(mappingAt(closing, 3)?.data).toMatchObject({ navigation: true, structure: true });
	expect(mappingAt(source.indexOf('label='), 5)?.data).toMatchObject({
		verification: true,
		completion: true,
		navigation: true,
	});
	expect(mappingAt(gap, 1)?.data).toMatchObject({
		verification: false,
		completion: true,
		navigation: false,
		structure: true,
	});
});

function expectExactMapping(
	result: ReturnType<typeof compileTsrxForTypeService>,
	source: string,
	text: string,
): void {
	const sourceOffset = source.indexOf(text);
	const generatedOffset = result.code.indexOf(text);
	expect(sourceOffset, `source offset for ${text}`).toBeGreaterThanOrEqual(0);
	expect(generatedOffset, `generated offset for ${text}`).toBeGreaterThanOrEqual(0);
	expect(
		result.mappings.find(
			(mapping) =>
				mapping.sourceOffsets[0] === sourceOffset &&
				mapping.generatedOffsets[0] === generatedOffset &&
				mapping.lengths[0] === text.length &&
				mapping.generatedLengths[0] === text.length,
		),
		`exact mapping for ${text}`,
	).toBeDefined();
}

function formatParseDiagnostics(source: string): string[] {
	return ts
		.createSourceFile('virtual.tsx', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX)
		.parseDiagnostics.map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
		);
}
