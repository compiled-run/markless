// The JSX contract in @markless/typescript-plugin owns these shapes; core only names them.

/** Anything that can sit in a component's `children` position. */
export type Children = __MarklessTypeService.Child;

/** Every attribute, event handler, `attach`, and `el` the given intrinsic tag accepts. */
export type PropsOf<Tag extends __MarklessTypeService.IntrinsicTagName> =
	__MarklessTypeService.IntrinsicElementFor<Tag>;
