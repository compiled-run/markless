declare module 'virtual:code-session-url' {
	/** Where the browser loads `session.ts` from; empty on the server. */
	const url: string;
	export default url;
}
