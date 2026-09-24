import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join, resolve } from 'pathe';
import ts from 'typescript';
import { expect, test } from 'vitest';

test('the packaged MDX runtime exposes usable scalar dispatch declarations', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'markless-router-package-'));
	try {
		await promisify(execFile)(
			'pnpm',
			['exec', 'vp', 'pack', '--filter', '@markless/router', '--out-dir', directory],
			{ cwd: resolve(import.meta.dirname, '../../..'), maxBuffer: 2_000_000 },
		);
		const consumer = join(directory, 'consumer.ts');
		await writeFile(
			consumer,
			`import { tryResumeMdxScalar } from './vite/runtime/mdx-route.js';
const input: Parameters<typeof tryResumeMdxScalar>[0] = {
  root: document.body,
  event: new MouseEvent('click'),
  element: document.body,
  propagationStopped: false,
};
const pending: Promise<boolean> = tryResumeMdxScalar(input, () => undefined, () => () => {});
void pending;
`,
		);
		const program = ts.createProgram([consumer], {
			noEmit: true,
			strict: true,
			skipLibCheck: false,
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			types: [],
		});
		expect(
			ts
				.getPreEmitDiagnostics(program)
				.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
		).toEqual([]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}, 30_000);
