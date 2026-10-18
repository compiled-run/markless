import { copyFile, mkdir, rename, rm, rmdir } from 'node:fs/promises';
import { basename, dirname, join } from 'pathe';
import { MARKLESS_BUILD_METADATA_FILES, MARKLESS_PUBLIC_BUILD_METADATA_FILES } from './chunking.ts';
import { MARKLESS_IMPORT_MAP_ASSET } from './content-hash-names.ts';

/** Where build-time hand-off files for a client output live: beside it, never inside the directory a host serves. */
export function marklessBuildManifestDir(clientOutDir: string): string {
	return join(dirname(clientOutDir), '.markless', basename(clientOutDir));
}

/** Where a build metadata file such as `build/bundle-graph.json` lands for a client output. */
export function marklessBuildManifestPath(clientOutDir: string, metadataFile: string): string {
	return join(marklessBuildManifestDir(clientOutDir), basename(metadataFile));
}

/** The chunk import map a packed client build hands to the server that renders its documents. */
export function marklessImportMapPath(clientOutDir: string): string {
	return join(marklessBuildManifestDir(clientOutDir), 'import-map.json');
}

export async function moveImportMapOutOfClientOutput(
	clientOutDir: string,
	emitted: boolean,
): Promise<void> {
	const target = marklessImportMapPath(clientOutDir);
	await rm(target, { force: true });
	if (!emitted) return;
	const written = join(clientOutDir, MARKLESS_IMPORT_MAP_ASSET);
	await mkdir(dirname(target), { recursive: true });
	await rename(written, target);
	// Leaves the folder alone when something else, such as Vite's own manifest, still lives there.
	await rmdir(dirname(written)).catch(() => undefined);
}

export async function moveBuildMetadataOutOfClientOutput(
	clientOutDir: string,
	emitted: ReadonlySet<string>,
	options: { readonly executionLogActive: boolean },
): Promise<void> {
	const served = new Set<string>(
		options.executionLogActive ? MARKLESS_PUBLIC_BUILD_METADATA_FILES : [],
	);
	for (const file of MARKLESS_BUILD_METADATA_FILES) {
		const target = marklessBuildManifestPath(clientOutDir, file);
		await rm(target, { force: true });
		if (!emitted.has(file)) continue;
		const written = join(clientOutDir, file);
		await mkdir(dirname(target), { recursive: true });
		await (served.has(file) ? copyFile(written, target) : rename(written, target));
	}
}
