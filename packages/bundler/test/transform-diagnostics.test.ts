import { expect, test } from 'vitest';
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

test('continues to transform a module carrying only an exempted diagnostic', async () => {
	const result = await transform('src/helper.tsrx', 'export const helper = 1;');

	expect(result.code).toBeTypeOf('string');
	expect(result.virtualModules.length).toBeGreaterThan(0);
});

test('rejects an alternate-shaped prefix write to a read-only prop', async () => {
	const filename = 'src/Inventory.tsrx';
	const source = `export function Inventory({ remaining }: { remaining: number }) @{
	<a onClick={() => --remaining}>{remaining}</a>
}`;

	await expect(transform(filename, source)).rejects.toThrow(
		'MARKLESS_STATE_READ_ONLY_WRITE',
	);
});
