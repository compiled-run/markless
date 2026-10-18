import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import {
	MARKLESS_BUILD_METADATA_FILES,
	MARKLESS_BUILD_PREFIX,
	MARKLESS_IMPORT_MAP_ASSET,
	MARKLESS_PUBLIC_BUILD_METADATA_FILES,
} from '../../packages/bundler/src/rolldown.ts';

/** Files in a served client output that only the build or the server reads: none may ship. */
export async function buildInternalFilesInPublicOutput(
	clientDir: string,
	options: { readonly executionLogActive?: boolean } = {},
): Promise<string[]> {
	const entries = await readdir(clientDir, { recursive: true, withFileTypes: true });
	const served = new Set<string>(
		options.executionLogActive ? MARKLESS_PUBLIC_BUILD_METADATA_FILES : [],
	);
	const internal = new Set<string>([...MARKLESS_BUILD_METADATA_FILES, MARKLESS_IMPORT_MAP_ASSET]);
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) =>
			relative(clientDir, join(entry.parentPath, entry.name)).split(sep).join('/'),
		)
		.filter(
			(file) =>
				!served.has(file) &&
				(internal.has(file) ||
					// The build prefix holds what the browser imports: chunks, styles and assets, never JSON.
					(file.startsWith(MARKLESS_BUILD_PREFIX) && file.endsWith('.json'))),
		)
		.sort();
}
