// Raw `tsc` cannot resolve .tsrx; the typescript-plugin can, and real resolution wins over this.
declare module '*.tsrx' {
	const component: (props: Record<string, unknown>) => unknown;
	export default component;
}
