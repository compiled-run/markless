import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The folder name each chunk's temp folder starts with. */
export const CHUNK_TEMP_PREFIX = 'markless-phone-chunk-';

/**
 * Runs a chunk with its own temp folder, removed when the chunk ends: the environment it gets points
 * TMPDIR (Node, xcodebuild, simctl) and Java's java.io.tmpdir (Maestro), which on macOS ignores TMPDIR, there.
 */
export async function withChunkTempDir<T>(
	env: NodeJS.ProcessEnv,
	run: (env: NodeJS.ProcessEnv) => Promise<T>,
	root: string = tmpdir(),
): Promise<T> {
	const dir = mkdtempSync(join(root, CHUNK_TEMP_PREFIX));
	const java = [env.JAVA_TOOL_OPTIONS, `-Djava.io.tmpdir=${dir}`].filter(Boolean).join(' ');
	try {
		return await run({ ...env, TMPDIR: dir, JAVA_TOOL_OPTIONS: java });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
