import type { CodeFile } from './protocol.ts';

/** Names a block by its starter files, in any order: the build and the page compute the same key. */
export function codeBlockKey(files: readonly CodeFile[]): string {
	const text = files
		.map((file) => `${file.name}\n${file.code}`)
		.toSorted()
		.join('\n');
	let hash = 2166136261;
	for (let index = 0; index < text.length; index++)
		hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
	return (hash >>> 0).toString(36);
}
