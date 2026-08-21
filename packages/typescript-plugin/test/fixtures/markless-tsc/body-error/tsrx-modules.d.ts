// The crutch this tool replaces: with a wildcard shim in the program, raw `tsc` resolves
// every .tsrx import and reports nothing at all. markless-tsc reads the file instead.
declare module '*.tsrx' {
	const component: (props: Record<string, unknown>) => unknown;
	export default component;
}
