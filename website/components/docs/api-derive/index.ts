// Manifest in, table rows and playground controls out. Every family page on the
// site is drawn from this module, so a prop added to a family reaches the docs
// by rebuilding rather than by anyone editing a page.
import {
	oneLine,
	partOf,
	partsInOrder,
	partsOf,
	propOf,
	type ManifestPart,
	type ManifestProp,
} from './manifest.ts';
import { controlFor, initialValue, type ControlDescriptor } from './control-kind.ts';

export * from './manifest.ts';
export * from './control-kind.ts';

/** One row of a part's props table. */
export type ApiRow = {
	/** The prop, written as the consumer writes it. */
	readonly name: string;
	/** Its type, verbatim from the family's own types file. */
	readonly type: string;
	/** What it buys you. Text between backticks is drawn as inline code. */
	readonly does: string;
	/** Required props are drawn bold. */
	readonly required?: boolean;
	/** The default written as source text, e.g. `false`. Absent when it has none. */
	readonly default?: string;
};

/** One row of a family's anatomy table: a part and the one line explaining it. */
export type AnatomyRow = {
	/** `accordion.item`, the name a consumer writes. */
	readonly name: string;
	/** `AccordionItem`, the component the family exports. */
	readonly component: string;
	readonly does: string;
	/** How many props of its own the part takes. */
	readonly propCount: number;
};

/** A control descriptor bound to the prop it came from. */
export type PropControl = ControlDescriptor & {
	readonly part: string;
	readonly prop: string;
	readonly required: boolean;
	/** The default as source text, straight from the manifest. */
	readonly defaultText?: string;
	/** That default read back as a value, when it is a scalar literal. */
	readonly initial?: string | number | boolean;
	readonly doc: string;
};

/** Names a prop on a part: what a `ui-meta` file lists for the quick controls row. */
export type PropRef = { readonly part: string; readonly prop: string };

function rowOf(prop: ManifestProp): ApiRow {
	return {
		name: prop.name,
		type: oneLine(prop.type),
		does: oneLine(prop.doc),
		required: prop.required === true ? true : undefined,
		default: prop.default,
	};
}

/** The props table for one part, in the order the family declares them. */
export function apiRows(family: string, part: string): readonly ApiRow[] {
	return partOf(family, part).props.map(rowOf);
}

/** One part's props table under its own heading: what a family's API reference is a list of. */
export type ApiSection = {
	/** `accordion.item`, the name a consumer writes. */
	readonly name: string;
	/** The heading's anchor, `accordion-item`. */
	readonly id: string;
	readonly rows: readonly ApiRow[];
};

/** Every part of a family with its rows, in `order` when given, else root first then alphabetical. */
export function apiSections(family: string, order?: readonly string[]): readonly ApiSection[] {
	const parts = order && order.length > 0 ? partsInOrder(family, order) : partsOf(family);
	return parts.map((part) => ({
		name: `${family}.${part.part}`,
		id: `${family}-${part.part}`,
		rows: part.props.map(rowOf),
	}));
}

function anatomyRowOf(family: string, part: ManifestPart): AnatomyRow {
	return {
		name: `${family}.${part.part}`,
		component: part.component,
		does: oneLine(part.doc),
		propCount: part.props.length,
	};
}

/**
 * The anatomy table for a family. Pass `order` to fix the reading order;
 * without it the parts come back root-first and then alphabetically.
 */
export function anatomyRows(family: string, order?: readonly string[]): readonly AnatomyRow[] {
	const parts = order && order.length > 0 ? partsInOrder(family, order) : partsOf(family);
	return parts.map((part) => anatomyRowOf(family, part));
}

/** The playground control for one prop, inferred from its type. */
export function propControl(family: string, part: string, prop: string): PropControl {
	const found = propOf(family, part, prop);
	return {
		...controlFor(found.type),
		part,
		prop,
		required: found.required === true,
		defaultText: found.default,
		initial: initialValue(found.default),
		doc: oneLine(found.doc),
	};
}

/** The controls a playground draws, in the order the `ui-meta` file lists them. */
export function propControls(family: string, refs: readonly PropRef[]): readonly PropControl[] {
	return refs.map((ref) => propControl(family, ref.part, ref.prop));
}
