// Downloads what a block's boot loads before the reader touches it; nothing it fetches runs until boot.
import { asset } from '../../../site-base.ts';
import { codeBlockKey } from './prefetch-key.ts';
import type { CodeFile } from './protocol.ts';

/** `_code-prefetch.json`, written by `tooling/code-prefetch.ts`. */
export type CodePrefetchManifest = {
	/** The session, editor and highlighter modules the page imports, for `modulepreload`. */
	readonly session: readonly string[];
	/** The live checklist's modules, for blocks with steps or update washes. */
	readonly live: readonly string[];
	/** The compile worker and the result frame with its static imports, which load outside the page's module map. */
	readonly cache: readonly string[];
	/** Each block's runtime modules its result frame imports, by `codeBlockKey`. */
	readonly blocks: Readonly<Record<string, readonly string[]>>;
};

export const CODE_PREFETCH_FILE = '_code-prefetch.json';

let manifest: Promise<CodePrefetchManifest | undefined> | undefined;
const linked = new Set<string>();

function link(rel: 'modulepreload' | 'prefetch', href: string): void {
	if (linked.has(href)) return;
	linked.add(href);
	const element = document.createElement('link');
	element.rel = rel;
	element.href = href;
	if (rel === 'prefetch' && href.endsWith('.html')) element.as = 'document';
	document.head.append(element);
}

export function prefetchCodeBlock(box: HTMLElement, files: readonly CodeFile[]): void {
	if (box.dataset.code !== 'idle') return;
	if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return;
	manifest ??= fetch(asset(CODE_PREFETCH_FILE))
		.then((response) => (response.ok ? (response.json() as Promise<CodePrefetchManifest>) : undefined))
		.catch(() => undefined);
	void manifest.then((found) => {
		if (!found) return;
		for (const href of found.session) link('modulepreload', href);
		if (box.hasAttribute('data-code-live')) for (const href of found.live) link('modulepreload', href);
		for (const href of [...found.cache, ...(found.blocks[codeBlockKey(files)] ?? [])])
			link('prefetch', href);
	});
}
