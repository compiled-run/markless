// The source files each site <Code> block loads beyond the page's session: the runtime modules its
// compiled starter imports, and the TypeScript grammar when it has a .ts file. By block key.
// Runs as its own process (`node tooling/code-runtime-sources.ts`), apart from the site build's bundler.
import { fileURLToPath } from 'node:url';
import { compileFiles } from '../components/docs/code/compile.ts';
import { corpus } from '../components/docs/code/incremental-corpus.ts';
import { nodeSourceHost } from '../components/docs/code/node-sources.ts';
import { packageFile } from '../components/docs/code/package-exports.ts';
import { languageOf } from '../components/docs/code/languages.ts';
import { codeBlockKey } from '../components/docs/code/prefetch-key.ts';
import type { CodeFile } from '../components/docs/code/protocol.ts';
import { isRuntimeSpecifier, runtimePackages } from '../components/docs/code/source-packages.ts';

const PACKAGES = fileURLToPath(new URL('../../packages/', import.meta.url));
const TYPESCRIPT_GRAMMAR = fileURLToPath(
	new URL('../components/docs/code/typescript-grammar.ts', import.meta.url),
);

export async function blockRuntimeSources(files: readonly CodeFile[]): Promise<string[]> {
	const outcome = await compileFiles(files, 'code-prefetch', nodeSourceHost());
	if (!outcome.ok)
		throw new Error(`a <Code> starter does not compile: ${JSON.stringify(outcome.diagnostics)}`);
	const packages = runtimePackages(PACKAGES);
	const sources = new Set<string>();
	for (const module of outcome.modules)
		for (const site of module.imports) {
			if (site.computed || !isRuntimeSpecifier(site.specifier)) continue;
			const file = packageFile(packages, site.specifier);
			if (file) sources.add(file);
		}
	return [...sources].toSorted();
}

export async function siteRuntimeSources(): Promise<Record<string, string[]>> {
	const byKey: Record<string, string[]> = {};
	for (const block of corpus)
		byKey[codeBlockKey(block.files)] = [
			...(await blockRuntimeSources(block.files)),
			...(block.files.some((file) => languageOf(file.name) === 'typescript') ? [TYPESCRIPT_GRAMMAR] : []),
		];
	return byKey;
}

if (import.meta.main) process.stdout.write(JSON.stringify(await siteRuntimeSources()));
