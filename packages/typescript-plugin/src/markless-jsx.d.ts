declare namespace __MarklessTypeService {
	interface Element {}

	interface ElementClass {}

	type Child = Element | string | number | boolean | null | undefined | readonly Child[];

	type Attributes<E extends Element> = {
		class?: string;
		children?: Child;
		title?: string;
		href?: string;
		onClick?: (event: MouseEvent & { currentTarget: E }) => void;
		[key: `data-${string}`]: string | number | boolean | undefined;
		[key: `aria-${string}`]: string | number | boolean | undefined;
	};

	type IntrinsicElements = {
		[K in keyof HTMLElementTagNameMap]: Attributes<HTMLElementTagNameMap[K]>;
	};
}

declare module '@markless/typescript-plugin/jsx-runtime' {
	export namespace JSX {
		type Element = __MarklessTypeService.Element;
		type ElementClass = __MarklessTypeService.ElementClass;
		interface ElementChildrenAttribute {
			children: unknown;
		}
		type IntrinsicElements = __MarklessTypeService.IntrinsicElements;
	}
}

declare module '@markless/typescript-plugin/jsx-dev-runtime' {
	export namespace JSX {
		type Element = __MarklessTypeService.Element;
		type ElementClass = __MarklessTypeService.ElementClass;
		interface ElementChildrenAttribute {
			children: unknown;
		}
		type IntrinsicElements = __MarklessTypeService.IntrinsicElements;
	}
}
