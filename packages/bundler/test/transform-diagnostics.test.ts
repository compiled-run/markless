import { expect, test } from 'vitest';
import {
	MarklessCompileError,
	formatMarklessSourceFrame,
	normalizeMarklessDevError,
} from '../src/dev-error/index.ts';
import { transformTsrxModule } from '../src/transform.ts';

function transform(filename: string, source: string) {
	return transformTsrxModule({
		filename,
		source,
		buildId: 'diagnostics-test',
	});
}

test('rejects a module with a parse error', async () => {
	const filename = 'src/Counter.tsrx';
	const source = `export function Counter({ count }: { count: number }) @{
	<button>{count}</button>>
}`;

	await expect(transform(filename, source)).rejects.toThrow(
		expect.objectContaining({
			message: expect.stringContaining('MARKLESS_COMPILE_BLOCKED'),
		}),
	);
	await expect(transform(filename, source)).rejects.toThrow('MARKLESS_PARSE_ERROR');
	await expect(transform(filename, source)).rejects.toThrow(filename);
});

test('throws a typed compile error whose structured payload survives Vite prepareError', async () => {
	const filename = 'src/BrokenCard.tsrx';
	const source = `export function BrokenCard() @{
	<section>{missing}</section>>
}`;
	let caught: unknown;
	try {
		await transform(filename, source);
	} catch (error) {
		caught = error;
	}

	expect(caught).toBeInstanceOf(MarklessCompileError);
	const error = caught as MarklessCompileError;
	expect(error.payload).toMatchObject({
		version: 1,
		id: filename,
		kind: 'compile',
		details: expect.stringContaining('MARKLESS_COMPILE_BLOCKED'),
		diagnostics: [
			expect.objectContaining({
				code: expect.stringMatching(/^MARKLESS_/),
				filename,
				line: 2,
				column: expect.any(Number),
				frame: expect.stringContaining('> 2 |'),
			}),
		],
	});
	expect(error.message).toBe(error.payload.details);
	expect(error).toMatchObject({
		id: filename,
		plugin: 'markless',
		pluginCode: expect.any(String),
		loc: expect.objectContaining({ file: filename, line: 2, column: expect.any(Number) }),
		frame: expect.stringContaining('> 2 |'),
	});

	const prepared = {
		id: error.id,
		frame: error.frame,
		pluginCode: error.pluginCode,
		loc: error.loc,
	};
	expect(normalizeMarklessDevError(prepared)).toEqual(error.payload);
});

test('formats two context lines and underlines a multiline span to the first line end', () => {
	const source = ['zero', 'one', 'two', 'three target', 'continued', 'five', 'six'].join('\n');
	const start = source.indexOf('target');
	const end = source.indexOf('continued') + 4;
	const frame = formatMarklessSourceFrame(source, { filename: 'src/Frame.tsrx', start, end });

	expect(frame).toContain('  2 | one');
	expect(frame).toContain('  3 | two');
	expect(frame).toContain('> 4 | three target');
	expect(frame).toContain('    |       ^^^^^^');
	expect(frame).toContain('  5 | continued');
	expect(frame).toContain('  6 | five');
});

test('rejects a write to a read-only prop with a source position', async () => {
	const filename = 'src/Counter.tsrx';
	const source = `export function Counter({ count }: { count: number }) @{
	<button onClick={() => count++}>{count}</button>
}`;

	await expect(transform(filename, source)).rejects.toThrow(
		/MARKLESS_STATE_READ_ONLY_WRITE:[\s\S]*\(src\/Counter\.tsrx:2:\d+\)/,
	);
});

test('continues to transform a clean module', async () => {
	const result = await transform(
		'src/Greeting.tsrx',
		`export function Greeting({ name }: { name: string }) @{
			<p>Hello {name}</p>
		}`,
	);

	expect(result.code).toBeTypeOf('string');
	expect(result.code.length).toBeGreaterThan(0);
	expect(result.virtualModules.length).toBeGreaterThan(0);
});

test('continues to transform a helper module with only a warning diagnostic', async () => {
	const result = await transform('src/helper.tsrx', 'export const helper = 1;');

	expect(result.code).toBeTypeOf('string');
	expect(result.virtualModules.length).toBeGreaterThan(0);
});

test('rejects an undeclared identifier write even when its diagnostic code also has warning variants', async () => {
	const filename = 'src/MissingWrite.tsrx';
	const source = `export function MissingWrite() @{
	<button onClick={() => missing++}>Write</button>
}`;

	await expect(transform(filename, source)).rejects.toThrow('MARKLESS_STATE_UNRESOLVED_WRITE');
});

test('continues to transform a member-expression write carrying a warning diagnostic', async () => {
	const result = await transform(
		'src/HostWrite.tsrx',
		`export function HostWrite() @{
			<button onClick={(event) => {
				(event.target as HTMLElement).dataset.done = 'yes';
			}}>Write</button>
		}`,
	);

	expect(result.code).toBeTypeOf('string');
	expect(result.virtualModules.length).toBeGreaterThan(0);
});

test('rejects an alternate-shaped prefix write to a read-only prop', async () => {
	const filename = 'src/Inventory.tsrx';
	const source = `export function Inventory({ remaining }: { remaining: number }) @{
	<a onClick={() => --remaining}>{remaining}</a>
}`;

	await expect(transform(filename, source)).rejects.toThrow('MARKLESS_STATE_READ_ONLY_WRITE');
});
