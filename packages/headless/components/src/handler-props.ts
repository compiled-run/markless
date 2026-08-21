/**
 * A handler the part itself calls. Element attributes accept one handler or a list,
 * but a part that forwards a consumer's handler invokes it - `onClick?.(event)` - and
 * cannot invoke a list. This strips the list form, so passing one is a type error at
 * the prop instead of a crash inside the part. The handler's own shape still comes
 * from the intrinsic contract; nothing is restated here.
 */
export type CallableHandler<Handler> = Exclude<Handler, readonly unknown[]>;

/**
 * The instance fields a family's root seeds from its props: the same fields the
 * consumer knows, made required and mutable, because a prop is optional to the
 * consumer while the root assigns every one of these on every render.
 */
export type Seeded<Props, Keys extends keyof Props> = {
	-readonly [Field in Keys]-?: Props[Field];
};
