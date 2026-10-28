import { existsSync, readFileSync, statSync } from 'node:fs';
import { moduleImportSpecifiers, summarizeModuleFunctions } from '@markless/compiler';
import type { LinkResolveContext } from '../link-driver.ts';
import type { TransformTsrxModuleInput } from '../types.ts';
import { pathname } from '../virtual-ids.ts';

type FunctionSummaries = NonNullable<TransformTsrxModuleInput['importedFunctionSummaries']>;

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|tsrx)$/;
const summarized = new Map<
	string,
	{ readonly source: string; readonly summaries: FunctionSummaries[string] }
>();

// Keyed by the specifier the importer wrote; a specifier that resolves to nothing readable gets an empty entry.
export async function importedFunctionSummaries(
	context: LinkResolveContext,
	importer: string,
	sources: Iterable<string>,
): Promise<FunctionSummaries> {
	const summaries: Record<string, FunctionSummaries[string]> = {};
	await Promise.all(
		[...new Set(sources)].map(async (specifier) => {
			summaries[specifier] = await summariesFor(context, importer, specifier);
		}),
	);
	return summaries;
}

// How deep imports of imports are followed; past it a function is code nobody read.
const MAX_IMPORT_DEPTH = 4;

async function summariesFor(
	context: LinkResolveContext,
	importer: string,
	specifier: string,
	depth = 0,
	visiting = new Set<string>(),
): Promise<FunctionSummaries[string]> {
	const resolved = await context.resolve(specifier, importer, { skipSelf: true });
	const id = typeof resolved === 'string' ? resolved : resolved?.id;
	if (!id || (typeof resolved === 'object' && resolved?.external)) return {};
	const filename = pathname(String(id));
	if (!SOURCE_FILE.test(filename) || !existsSync(filename) || !statSync(filename).isFile()) {
		return {};
	}
	if (visiting.has(filename) || depth > MAX_IMPORT_DEPTH) return {};
	if (!filename.includes('/node_modules/')) context.addWatchFile?.(filename);
	const source = readFileSync(filename, 'utf8');
	const cached = summarized.get(filename);
	if (cached?.source === source) return cached.summaries;
	const nextVisiting = new Set(visiting).add(filename);
	const nested: Record<string, FunctionSummaries[string]> = {};
	await Promise.all(
		moduleImportSpecifiers({ filename, source }).map(async (inner) => {
			nested[inner] = await summariesFor(context, filename, inner, depth + 1, nextVisiting);
		}),
	);
	const summaries =
		summarizeModuleFunctions({
			filename,
			source,
			imported: (inner, name) => nested[inner]?.[name],
		}) ?? {};
	summarized.set(filename, { source, summaries });
	return summaries;
}

/** The function summaries a compile asked for that its input does not carry yet. */
export function missingFunctionSummaries(
	requests: ReadonlyArray<string> | undefined,
	known: FunctionSummaries | undefined,
): string[] {
	return [
		...new Set((requests ?? []).filter((source) => !(known && Object.hasOwn(known, source)))),
	];
}
