declare module 'virtual:code-live-url' {
	/** Where the browser loads `live.ts` from; empty on the server. */
	const url: string;
	export default url;
}
