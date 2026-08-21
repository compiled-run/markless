// Raw `tsc` cannot resolve .tsrx; the typescript-plugin can, and real resolution wins over this.
// The wildcard governs test-app modules (family components carry their own sidecars),
// and a test app is a zero-argument renderable the browser harness can mount.
declare module '*.tsrx' {
	const component: import('@markless/core').CsrRenderable;
	export default component;
}
