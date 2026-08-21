#!/usr/bin/env node
// markless-tsc: tsc for a workspace that contains .tsrx.
//
// Raw `tsc` cannot resolve or read a `.tsrx` file, which is why the repo used to carry
// hand-written `.tsrx.d.ts` sidecars. This runs the ordinary TypeScript command line with
// the Volar language layer injected, exactly the way vue-tsc wraps tsc for `.vue`: every
// `.tsrx` reaches the checker as the TSX the Markless type service generates for it, so
// imports get the real prop types and the file's own body is checked too.
//
// Everything a tsc invocation supports still works - flags, `-p`, `--watch` - because the
// tsc command line is what actually runs.
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { MARKLESS_TSRX_EXTENSIONS } from './language.ts';
import {
	addMarklessJsxContract,
	clearMarklessCompileErrors,
	createMarklessTypecheckLanguagePlugin,
	formatMarklessCompileError,
	marklessCompileErrors,
} from './typecheck.ts';

const require = createRequire(import.meta.url);

type RunTsc = (
	tscPath: string,
	options: { extraSupportedExtensions: string[]; extraExtensionsToRemove: string[] },
	getLanguagePlugins: (
		typescript: typeof import('typescript'),
		programOptions: { rootNames: string[] },
	) => unknown[],
) => unknown;

/**
 * Run the TypeScript command line over `argv` with `.tsrx` support.
 *
 * `runTsc` patches TypeScript's own `tsc.js` in memory - it never writes to disk - and the
 * patched command line calls `process.exit` itself, so the exit code is tsc's own. Markless
 * compile errors are raised while the program is built, before any of that, and the exit
 * hook below turns them into a failing status even when TypeScript found nothing to say.
 */
export function runMarklessTsc(argv: readonly string[]): void {
	clearMarklessCompileErrors();
	const { runTsc } = require('@volar/typescript/lib/quickstart/runTsc.js') as {
		runTsc: RunTsc;
	};
	const tscPath = require.resolve('typescript/lib/tsc.js');

	process.argv = [process.argv[0] ?? 'node', tscPath, ...argv];
	process.on('exit', () => {
		const errors = marklessCompileErrors();
		if (errors.length === 0) return;
		const plural = errors.length === 1 ? 'error' : 'errors';
		process.stderr.write(`Found ${errors.length} Markless TSRX compile ${plural}.\n`);
		// tsc's own status for "diagnostics were reported"; a zero from tsc must not stand.
		if (!process.exitCode) process.exitCode = 2;
	});

	runTsc(
		tscPath,
		{
			extraSupportedExtensions: [...MARKLESS_TSRX_EXTENSIONS],
			extraExtensionsToRemove: [...MARKLESS_TSRX_EXTENSIONS],
		},
		(typescript, programOptions) => {
			// Runs while the program is still being assembled, so a root added here is checked.
			addMarklessJsxContract(programOptions.rootNames);
			return [
				createMarklessTypecheckLanguagePlugin(typescript, (error, source) => {
					const line = formatMarklessCompileError(error, source, process.cwd());
					process.stderr.write(`${line}\n`);
				}),
			];
		},
	);
}

// Run only when this file is the entry point; importing it from a test must not run tsc.
// argv[1] may be a bin symlink, so both sides are resolved through the filesystem.
const entryPoint = process.argv[1];
if (entryPoint && realpathOrSelf(entryPoint) === realpathOrSelf(fileURLToPath(import.meta.url))) {
	runMarklessTsc(process.argv.slice(2));
}

function realpathOrSelf(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}
