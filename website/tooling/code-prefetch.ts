// What a <Code> block's boot loads, by built file, so the page can download it before the reader acts.
import type { CodePrefetchManifest } from '../components/docs/code/prefetch.ts';

type BundleChunk = {
	readonly type: 'chunk';
	readonly fileName: string;
	readonly facadeModuleId: string | null;
	readonly moduleIds: readonly string[];
	readonly imports: readonly string[];
	readonly dynamicImports: readonly string[];
	readonly code: string;
};
type BundleAsset = { readonly type: 'asset'; readonly fileName: string; readonly source: string | Uint8Array };
export type PrefetchBundle = Readonly<Record<string, BundleChunk | BundleAsset>>;

export type CodePrefetchInput = {
	readonly base: string;
	readonly sessionEntry: string;
	readonly liveEntry: string;
	readonly frameEntry: string;
	/** The frame module whose `import()`s name every runtime module. */
	readonly runtimeTable: string;
	/** The result frame page, under the site's base path. */
	readonly frameFile: string;
	/** Each block's runtime source files, by `codeBlockKey`. */
	readonly blocks: Readonly<Record<string, readonly string[]>>;
};

export function codePrefetchManifest(bundle: PrefetchBundle, input: CodePrefetchInput): CodePrefetchManifest {
	const chunks = Object.values(bundle).filter((output): output is BundleChunk => output.type === 'chunk');
	const byModule = new Map<string, BundleChunk>();
	for (const chunk of chunks) for (const id of chunk.moduleIds) byModule.set(id, chunk);
	const entry = (file: string): BundleChunk => {
		const chunk = chunks.find((candidate) => candidate.facadeModuleId === file) ?? byModule.get(file);
		if (!chunk) throw new Error(`no built chunk holds ${file}`);
		return chunk;
	};
	// The frame's runtime code loads pieces of itself lazily, so its closure follows `import()` too, except
	// from the chunk holding the frame's table of every runtime module, which a block reaches only by its own imports.
	const closure = (roots: readonly string[], into = new Set<string>(), lazy = false): Set<string> => {
		const stack = [...roots];
		while (stack.length) {
			const fileName = stack.pop()!;
			if (into.has(fileName)) continue;
			into.add(fileName);
			const output = bundle[fileName];
			if (output?.type !== 'chunk') continue;
			stack.push(...output.imports);
			if (lazy && !output.moduleIds.includes(input.runtimeTable)) stack.push(...output.dynamicImports);
		}
		return into;
	};
	const session = entry(input.sessionEntry);
	const sessionFiles = closure([session.fileName, ...session.dynamicImports]);
	const liveFiles = closure([entry(input.liveEntry).fileName]);
	for (const file of sessionFiles) liveFiles.delete(file);
	// A worker reaches the page only as the URL of a built, self-contained .js asset named in the session's code.
	const sessionCode = [...sessionFiles]
		.map((file) => {
			const output = bundle[file];
			return output?.type === 'chunk' ? output.code : '';
		})
		.join('\n');
	const workers = Object.values(bundle)
		.filter(
			(output) =>
				output.type === 'asset' &&
				output.fileName.endsWith('.js') &&
				sessionCode.includes(output.fileName.split('/').pop()!),
		)
		.map((output) => output.fileName);
	const cacheFiles = closure([entry(input.frameEntry).fileName], new Set(workers), true);
	const blocks: Record<string, string[]> = {};
	for (const [key, sources] of Object.entries(input.blocks)) {
		const files = closure(sources.map((source) => entry(source).fileName), new Set(), true);
		blocks[key] = [...files].filter((file) => !cacheFiles.has(file)).toSorted().map((file) => input.base + file);
	}
	const urls = (files: Iterable<string>) => [...files].toSorted().map((file) => input.base + file);
	return {
		session: urls(sessionFiles),
		live: urls(liveFiles),
		cache: [...urls(cacheFiles), input.frameFile],
		blocks,
	};
}
