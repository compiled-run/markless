/**
 * A DOM event attribute accepts one handler or a list of them. A part that forwards a
 * consumer's handler calls it - `onClick?.(event)` - so only the single spelling is part of
 * a part's contract; the list form would be a call on an array at runtime. Narrowing the
 * prop states that, instead of accepting a value the part cannot use.
 *
 * The handler type still comes from the intrinsic contract, so nothing is restated here.
 */
export type SingleHandler<Handler> = Exclude<Handler, readonly unknown[]>;
