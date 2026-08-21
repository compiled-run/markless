// EDITOR FALLBACK ONLY. tsserver has no resolution hook for .tsrx imports from
// .ts files, so without this ambient module the editor shows "Cannot find
// module './scenarios/x.tsrx'". The real typecheck is `pnpm typecheck`
// (markless-tsc), whose volar resolution finds the actual module and wins over
// this wildcard — so the gate sees real component types while the editor gets
// a mountable renderable. Deletable the day the editor plugin resolves .tsrx
// imports itself.
declare module '*.tsrx' {
	const component: import('@markless/core').CsrRenderable;
	export default component;
}
