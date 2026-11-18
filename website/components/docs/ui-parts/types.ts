/** One part as the package's source writes it: what SPEC.md calls it, what it renders, what it styles by. */
export type PartFacts = {
	readonly part: string;
	/** The SPEC.md role the name ends in, such as `trigger` for `itemtrigger`; empty when it ends in none. */
	readonly role: string;
	/** The HTML element the part renders, such as `button`. */
	readonly element: string;
	/** A literal `role` the part writes on that element, such as `region`. */
	readonly ariaRole: string;
	/** A form field the reader never sees. */
	readonly hidden: boolean;
	/** The `ui-*` attributes the part writes, sorted. */
	readonly hooks: readonly string[];
};
