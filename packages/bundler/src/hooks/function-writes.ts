import { existsSync, readFileSync, statSync } from 'node:fs';
import { analyzeModuleFunctionWrites } from '@markless/compiler';
import type { LinkResolveContext } from '../link-driver.ts';
import type { TransformTsrxModuleInput } from '../types.ts';
import { TSRX_SOURCE_FILE, pathname } from '../virtual-ids.ts';

type FunctionWrites = NonNullable<TransformTsrxModuleInput['importedFunctionWrites']>;

const SCRIPT_FILE = /\.[cm]?[jt]sx?$/;
const analyzed = new Map<
	string,
	{ readonly source: string; readonly writes: FunctionWrites[string] }
>();

/** Write facts of each imported project module, by specifier; a package gets none, so its calls stay assumed. */
export async function importedFunctionWrites(
	context: LinkResolveContext,
	importer: string,
	sources: Iterable<string>,
): Promise<FunctionWrites> {
	const writes: Record<string, FunctionWrites[string]> = {};
	await Promise.all(
		[...new Set(sources)].map(async (specifier) => {
			writes[specifier] = await functionWritesFor(context, importer, specifier);
		}),
	);
	return writes;
}

async function functionWritesFor(
	context: LinkResolveContext,
	importer: string,
	specifier: string,
): Promise<FunctionWrites[string]> {
	const resolved = await context.resolve(specifier, importer, { skipSelf: true });
	const id = typeof resolved === 'string' ? resolved : resolved?.id;
	if (!id) return {};
	const filename = pathname(String(id));
	if (
		(!TSRX_SOURCE_FILE.test(filename) && !SCRIPT_FILE.test(filename)) ||
		filename.includes('/node_modules/') ||
		!existsSync(filename) ||
		!statSync(filename).isFile()
	) {
		return {};
	}
	context.addWatchFile?.(filename);
	const source = readFileSync(filename, 'utf8');
	const cached = analyzed.get(filename);
	if (cached?.source === source) return cached.writes;
	const writes = analyzeModuleFunctionWrites({ filename, source });
	analyzed.set(filename, { source, writes });
	return writes;
}

/** The imported modules a compile asked for write facts of that its input does not carry yet. */
export function missingFunctionWriteSources(
	requests: ReadonlyArray<string> | undefined,
	known: FunctionWrites | undefined,
): string[] {
	return [...new Set(requests ?? [])].filter((source) => !known || !Object.hasOwn(known, source));
}
