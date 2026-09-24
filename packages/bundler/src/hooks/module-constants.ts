import { existsSync, readFileSync, statSync } from 'node:fs';
import { evaluateModuleConstants } from '@markless/compiler';
import type { LinkResolveContext } from '../link-driver.ts';
import type { TransformTsrxModuleInput } from '../types.ts';
import { TSRX_SOURCE_FILE, pathname } from '../virtual-ids.ts';

type ModuleConstants = NonNullable<TransformTsrxModuleInput['importedModuleConstants']>;

const PLAIN_SCRIPT_FILE = /\.[cm]?[jt]sx?$/;
const evaluated = new Map<
	string,
	{ readonly source: string; readonly constants: ModuleConstants[string] }
>();

/**
 * The plain-data `const` exports of each imported script module a component prop
 * reads, keyed by the specifier the importer wrote. A specifier that resolves to
 * nothing evaluable still gets an (empty) entry, so the compile refuses the prop
 * instead of asking again.
 */
export async function importedModuleConstants(
	context: LinkResolveContext,
	importer: string,
	sources: Iterable<string>,
): Promise<ModuleConstants> {
	const constants: Record<string, ModuleConstants[string]> = {};
	await Promise.all(
		[...new Set(sources)].map(async (specifier) => {
			constants[specifier] = await moduleConstantsFor(context, importer, specifier);
		}),
	);
	return constants;
}

async function moduleConstantsFor(
	context: LinkResolveContext,
	importer: string,
	specifier: string,
): Promise<ModuleConstants[string]> {
	const resolved = await context.resolve(specifier, importer, { skipSelf: true });
	const id = typeof resolved === 'string' ? resolved : resolved?.id;
	if (!id) return {};
	const filename = pathname(String(id));
	if (
		TSRX_SOURCE_FILE.test(filename) ||
		!PLAIN_SCRIPT_FILE.test(filename) ||
		!existsSync(filename) ||
		!statSync(filename).isFile()
	) {
		return {};
	}
	context.addWatchFile?.(filename);
	const source = readFileSync(filename, 'utf8');
	const cached = evaluated.get(filename);
	if (cached?.source === source) return cached.constants;
	const moduleConstants = evaluateModuleConstants({ filename, source });
	evaluated.set(filename, { source, constants: moduleConstants });
	return moduleConstants;
}

/** The imported constants a compile asked for that its input does not carry yet. */
export function missingConstantSources(
	requests: ReadonlyArray<{ readonly source: string }> | undefined,
	known: ModuleConstants | undefined,
): string[] {
	return [
		...new Set(
			(requests ?? []).flatMap((request) =>
				known && Object.hasOwn(known, request.source) ? [] : [request.source],
			),
		),
	];
}
