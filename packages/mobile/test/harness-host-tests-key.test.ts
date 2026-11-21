import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { dragonCheckout, iosHostTestsKey } from '../src/harness/host-tests.ts';

const scratch = mkdtempSync(join(tmpdir(), 'host-tests-key-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const ios = join(scratch, 'src', 'adapters', 'ios');
const write = (path: string, text: string) => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
};
write(join(ios, 'Package.swift'), '// package');
write(join(ios, 'Sources', 'Host.swift'), 'let a = 1');
write(join(ios, 'Tests', 'case.json'), '{}');
write(join(scratch, 'conformance', 'vector.json'), '[]');

describe('the iOS host tests pass key', () => {
	test('changes with every input the tests read', () => {
		const before = iosHostTestsKey(ios, undefined);
		for (const [file, text] of [
			[join(ios, 'Sources', 'Host.swift'), 'let a = 2'],
			[join(ios, 'Tests', 'case.json'), '{"a":1}'],
			[join(scratch, 'conformance', 'vector.json'), '[1]'],
		] as const) {
			write(file, text);
			const after = iosHostTestsKey(ios, undefined);
			expect(after).not.toBe(before);
		}
		expect(iosHostTestsKey(ios, '/dragon')).not.toBe(iosHostTestsKey(ios, undefined));
	});

	test('holds when only files the tests do not read change', () => {
		const before = iosHostTestsKey(ios, undefined);
		write(join(ios, 'README.md'), 'notes');
		write(join(ios, 'Sources', 'data.json'), '{}');
		write(join(scratch, 'conformance', 'notes.md'), 'notes');
		expect(iosHostTestsKey(ios, undefined)).toBe(before);
	});

	test('the CI script prints the key for this checkout', () => {
		const script = join(import.meta.dirname, '..', 'src', 'harness', 'host-tests-key.ts');
		const printed = execFileSync(process.execPath, [script], { encoding: 'utf8' }).trim();
		const real = join(import.meta.dirname, '..', 'src', 'adapters', 'ios');
		expect(printed).toBe(iosHostTestsKey(real, dragonCheckout()));
	});
});
