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
