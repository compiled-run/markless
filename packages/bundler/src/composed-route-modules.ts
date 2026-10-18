import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'pathe';

const SCANNED = new Set(['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.tsrx', '.mdx']);
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.output', '.nitro', '.git']);
// Only a specifier naming a .tsrx or .mdx module can reach a page, which is one of those.
const SPECIFIER =
	/(?:\bfrom|\bimport|\bimport\s*\()\s*['"]([^'"]*\.(?:tsrx|mdx)(?:\?[^'"]*)?)['"]/g;

/**
 * The page modules some file in the app imports. A page nothing imports is
 * rendered only by the router, so its props never change in the browser; one
 * that is imported may be rendered as a child whose props can.
 */
export async function importedRouteModules(input: {
	readonly root: string;
	readonly isRoute: (file: string) => boolean;
	readonly resolve: (specifier: string, importer: string) => Promise<string | undefined>;
}): Promise<Set<string>> {
	const imported = new Set<string>();
	const visit = async (dir: string): Promise<void> => {
		const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
		await Promise.all(
			entries.map(async (entry) => {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) {
					if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith('.'))
						await visit(path);
					return;
				}
				if (!SCANNED.has(extname(entry.name))) return;
				const source = await readFile(path, 'utf8').catch(() => '');
				for (const [, specifier] of source.matchAll(SPECIFIER)) {
					const resolved = await input.resolve(specifier!, path);
					const file = resolved?.split('?')[0];
					if (file && file !== path && input.isRoute(file)) imported.add(file);
				}
			}),
		);
	};
	await visit(input.root);
	return imported;
}
