import { mkdir, rename, rm, rmdir } from 'node:fs/promises';
import { basename, dirname, join } from 'pathe';
import { MARKLESS_IMPORT_MAP_ASSET } from './content-hash-names.ts';

/** Where build-time hand-off files for a client output live: beside it, never inside the directory a host serves. */
export function marklessBuildManifestDir(clientOutDir: string): string {
	return join(dirname(clientOutDir), '.markless', basename(clientOutDir));
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
