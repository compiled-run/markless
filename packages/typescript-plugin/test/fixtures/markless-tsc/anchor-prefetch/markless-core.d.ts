// Stands in for the package so the program pulls in no workspace sources.
declare module '@markless/core' {
	export type PropsOf<Tag extends __MarklessTypeService.IntrinsicTagName> =
		__MarklessTypeService.IntrinsicElementFor<Tag> & { readonly children?: unknown };
}
