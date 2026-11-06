declare module 'virtual:code-prefetch' {
	import type { CodePrefetchManifest } from './prefetch.ts';
	/** What each block's boot loads, by built URL; empty lists in the browser. */
	const manifest: CodePrefetchManifest;
	export default manifest;
}
