import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { styleExportKey } from '../src/style-export.ts';

const scratch = mkdtempSync(join(tmpdir(), 'style-export-key-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const write = (path: string, text: string) => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
};
const dragon = join(scratch, 'dragon');
const git = (...args: string[]) =>
	execFileSync('git', ['-C', dragon, ...args], {
		stdio: 'ignore',
		// Under the pre-commit hook GIT_DIR and GIT_INDEX_FILE name the hook's repository; this one is the scratch checkout.
		env: {
			...Object.fromEntries(
				Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
			),
			GIT_AUTHOR_NAME: 't',
			GIT_AUTHOR_EMAIL: 't@t',
			GIT_COMMITTER_NAME: 't',
			GIT_COMMITTER_EMAIL: 't@t',
		},
	});
write(join(dragon, 'package.json'), '{}');
git('init', '-q');
git('add', '.');
git('commit', '-q', '-m', 'one');
const input = join(scratch, 'app', 'native-style-input', 'index.json');
const font = join(scratch, 'app', 'styles', 'fonts', 'Face.woff2');
const inputText = (extra = '') =>
	JSON.stringify({
		component: `AllNotes${extra}`,
		fonts: [{ url: './fonts/Face.woff2', file: '../styles/fonts/Face.woff2' }],
	});
write(input, inputText());
write(font, 'font bytes');

describe('the Dragon style export cache key', () => {
	test('changes with the input, a font file it names, the plan flag and the Dragon commit', () => {
		const before = styleExportKey(input, dragon, true);
		expect(before).toBeDefined();
		expect(styleExportKey(input, dragon, true)).toBe(before);
		expect(styleExportKey(input, dragon, false)).not.toBe(before);

		write(input, inputText(' edited'));
		expect(styleExportKey(input, dragon, true)).not.toBe(before);
		write(input, inputText());

		write(font, 'other font bytes');
		expect(styleExportKey(input, dragon, true)).not.toBe(before);
		write(font, 'font bytes');
		expect(styleExportKey(input, dragon, true)).toBe(before);

		write(join(dragon, 'engine.ts'), 'a');
		git('add', '.');
		git('commit', '-q', '-m', 'two');
		expect(styleExportKey(input, dragon, true)).not.toBe(before);
	});

	test('is not given for a Dragon checkout with uncommitted changes', () => {
		write(join(dragon, 'engine.ts'), 'b');
		expect(styleExportKey(input, dragon, true)).toBeUndefined();
		write(join(dragon, 'untracked.ts'), 'c');
		git('checkout', '-q', '--', 'engine.ts');
		expect(styleExportKey(input, dragon, true)).toBeUndefined();
	});
});
