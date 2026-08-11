// Upstream ships JavaScript with no declarations. Naming the module keeps the import
// typed instead of implicitly any; src/index.ts asserts the tsserver factory shape once.
declare module '@tsrx/typescript-plugin' {
	const upstreamTsrxTypeScriptPlugin: unknown;
	export default upstreamTsrxTypeScriptPlugin;
}
