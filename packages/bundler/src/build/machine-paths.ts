import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, normalize } from 'pathe';
import { rootRelativeId } from '../module-id.ts';

const rootsByBuildRoot = new Map<string, string[]>();

// The checkout's absolute paths: the build root and the workspace it sits in, as spelled and as resolved.
export function machinePathRoots(root: string): string[] {
	const cached = rootsByBuildRoot.get(root);
	if (cached) return cached;
	const roots = new Set<string>();
	for (const start of [normalize(root), realpathOrSelf(root)]) {
		roots.add(start);
		for (
			let directory = start;
			dirname(directory) !== directory;
			directory = dirname(directory)
		) {
			if (
				existsSync(join(directory, 'pnpm-workspace.yaml')) ||
				existsSync(join(directory, '.git'))
			) {
				roots.add(directory);
				break;
			}
		}
	}
	const found = [...roots].filter((path) => path !== '/');
	rootsByBuildRoot.set(root, found);
	return found;
}

/** `text` with every checkout path removed, as spelled raw, URI-encoded, or as a bundler-minted identifier. */
export function withoutMachinePaths(text: string, root: string | undefined): string {
	if (!root) return text;
	const asIdentifier = (value: string) => value.replace(/[^\w$]/g, '_');
	let stripped = text;
	for (const path of machinePathRoots(root)) {
		const encoded = encodeURIComponent(`${path}/`);
		for (const spelling of [
			`${path}/`,
			encoded,
			encoded.replaceAll('%', '_'),
			asIdentifier(encoded),
			asIdentifier(`${path}/`),
		])
			stripped = stripped.split(spelling).join('');
	}
	return stripped;
}

/** Emitted files whose contents spell a machine path, raw, URI-encoded, or inside a bundler-minted identifier. */
export function machinePathLeaks(
	bundle: Readonly<Record<string, unknown>>,
	roots: readonly string[],
): string[] {
	const asIdentifier = (value: string) => value.replace(/[^\w$]/g, '_');
	const needles = roots.flatMap((path) => {
		const encoded = encodeURIComponent(`${path}/`);
		return [`${path}/`, encoded, asIdentifier(encoded), asIdentifier(`${path}/`)];
	});
	const leaks: string[] = [];
	for (const [fileName, output] of Object.entries(bundle)) {
		const item = output as { type?: string; code?: string; source?: string | Uint8Array };
		const contents =
			item.type === 'chunk'
				? item.code
				: typeof item.source === 'string'
					? item.source
					: item.source instanceof Uint8Array
						? new TextDecoder().decode(item.source)
						: undefined;
		if (contents && needles.some((needle) => contents.includes(needle))) leaks.push(fileName);
	}
	return leaks.sort();
}

function realpathOrSelf(path: string): string {
	try {
		return normalize(realpathSync(path));
	} catch {
		return normalize(path);
	}
}

// Unminified output names each module in a `//#region <id>` comment; virtual ids there embed the source path.
export function rootRelativeRegionComments(
	bundle: Readonly<Record<string, unknown>>,
	root: string | undefined,
): void {
	if (!root) return;
	for (const output of Object.values(bundle)) {
		const chunk = output as { type?: string; code?: string };
		if (chunk.type !== 'chunk' || !chunk.code?.includes('//#region ')) continue;
		chunk.code = chunk.code.replace(
			/^(\/\/#region (?:\\0)?)(.+)$/gm,
			(_, prefix: string, id: string) => `${prefix}${rootRelativeId(id, root)}`,
		);
	}
}
