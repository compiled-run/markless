/**
 * The value of PROTOCOL_LOCATOR_PATHS_ATTRIBUTE: the served element count in decimal, the tag
 * table joined by `,`, `|`, then for every located element and each of its ancestors, in tree
 * order, four numbers: how many levels to step up from the previous entry to reach its parent (the
 * container is 0), its DOM-order index as a delta from the previous entry, its place among the
 * parent's element children, and its tag's place in the table; then `|` and each parent's served
 * element-child count, in the order entries first name that parent. Numbers are written low five
 * bits first: a digit from the first 32 here ends a number, one from the last 32 carries.
 */
export const PROTOCOL_LOCATOR_PATHS_DIGITS =
	'0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-';
