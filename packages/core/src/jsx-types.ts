// The JSX contract in @markless/typescript-plugin owns these shapes; core only names them.

/** Anything that can sit in a component's `children` position. */
export type Children = __MarklessTypeService.Child;

/** The HTML tags that cannot have children; every other tag's props include them. */
type VoidTagName =
	| 'area'
	| 'base'
	| 'br'
	| 'col'
	| 'embed'
	| 'hr'
	| 'img'
	| 'input'
	| 'link'
	| 'meta'
	| 'source'
	| 'track'
	| 'wbr';

/**
 * Every attribute, event handler, `attach`, and `el` the given intrinsic tag accepts.
 * Tags that can hold content also accept `children`; void tags do not, so a part
 * wrapping an `<input>` cannot be projected into by mistake.
 */
export type PropsOf<Tag extends __MarklessTypeService.IntrinsicTagName> =
	__MarklessTypeService.IntrinsicElementFor<Tag> &
		(Tag extends VoidTagName ? unknown : { readonly children?: Children });

/**
 * The instance fields a widget root seeds from its props: the same fields the
 * consumer knows, made required and mutable, because a prop is optional to the
 * consumer while the root assigns every one of them on every render.
 */
export type Seeded<Props, Keys extends keyof Props> = {
	-readonly [Field in Keys]-?: Props[Field];
};

/**
 * A compiled TSRX component, as a value: what a `.tsrx` module's default export
 * is, what test harnesses mount, and what composition renders. The runtime's
 * internal contract stays internal; this is the name consumers see.
 */
export type Component = import('./render.ts').CsrRenderable;
