import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join, resolve } from 'pathe';
import ts from 'typescript';
import { expect, test } from 'vitest';
import { MARKLESS_JSX_CONTRACT_FILE } from '../../typescript-plugin/src/typecheck.ts';

// Packs and type-checks the router: 22.8 s alone at load average 54, past 30 s in the pre-commit unit lane.
test('the packaged declarations typecheck on their own and under the JSX contract', async () => {
	// Inside the package so the declarations resolve @markless/web the way an installed router does.
	const directory = await mkdtemp(join(import.meta.dirname, '../.package-build-'));
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
import { Html } from './index.js';
const input: Parameters<typeof tryResumeMdxScalar>[0] = {
  root: document.body,
  event: new MouseEvent('click'),
  element: document.body,
  propagationStopped: false,
};
const pending: Promise<boolean> = tryResumeMdxScalar(input, () => undefined, () => () => {});
void pending;
void Html({ lang: 'en', class: 'page', children: undefined });
`,
		);
		expect(typeErrors(directory, [consumer])).toEqual([]);

		const contractConsumer = join(directory, 'contract-consumer.ts');
		await writeFile(
			contractConsumer,
			`import { Html } from './index.js';
void Html({ lang: 'en', dir: 'ltr', manifest: '/app.webmanifest', children: 'page' });
// @ts-expect-error the JSX contract types <html>'s attributes
void Html({ lnag: 'en' });
// @ts-expect-error the JSX contract types its children
void Html({ children: { not: 'a child' } });
`,
		);
		expect(typeErrors(directory, [contractConsumer, MARKLESS_JSX_CONTRACT_FILE])).toEqual([]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}, 120_000);

function typeErrors(directory: string, rootNames: readonly string[]): string[] {
	const program = ts.createProgram(rootNames, {
		noEmit: true,
		strict: true,
		skipLibCheck: false,
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		types: [],
	});
	return ts
		.getPreEmitDiagnostics(program)
		.filter((diagnostic) => !diagnostic.file || diagnostic.file.fileName.startsWith(directory))
		.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}
