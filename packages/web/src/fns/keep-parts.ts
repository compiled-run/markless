// Server only: marks the parts of a page a navigation can keep (see PROTOCOL_KEEP_ATTRIBUTE). The router's page server
// installs it; the renderer calls it through KEEP_PARTS_HOOK.
import {
	PROTOCOL_PROP_GRAPH_NODE_PREFIX,
	PROTOCOL_PROPS_GRAPH_NODE_ID,
} from '@markless/serializer';
import {
	PROTOCOL_KEEP_ATTRIBUTE,
	PROTOCOL_OWN_ATTRIBUTE,
} from '../../../serializer/src/protocol-keep.ts';
import { KEEP_PARTS_HOOK, type KeepParts } from './keep-parts-hook.ts';

export { PROTOCOL_KEEP_ATTRIBUTE, PROTOCOL_OWN_ATTRIBUTE };

type Coordinates = {
	readonly locators: ReadonlyArray<unknown>;
	readonly anchors: ReadonlyArray<{ readonly kind: string }>;
};

type SsrDataChildView = {
	readonly locators?: ReadonlyArray<unknown>;
	readonly keyedRepeats?: ReadonlyArray<unknown>;
	readonly domUpdates?: ReadonlyArray<{
		readonly graphNodeId?: unknown;
		readonly path?: ReadonlyArray<string>;
	}>;
};

type SsrDataChildOutput = {
	readonly state?: {
		readonly cells?: ReadonlyArray<unknown>;
		readonly computed?: ReadonlyArray<unknown>;
	};
	readonly propEvents?: ReadonlyArray<unknown>;
};
type SsrDataChildRecords = SsrDataChildView & {
	readonly events?: ReadonlyArray<unknown>;
	readonly behaviors?: ReadonlyArray<unknown>;
	readonly elementHandles?: ReadonlyArray<unknown>;
	readonly branches?: ReadonlyArray<unknown>;
	readonly asyncBoundaries?: ReadonlyArray<unknown>;
};

// Nothing the browser resumes: no state, events, behaviours, handles, branches or async content.
function noResumeRecords(child: SsrDataChildOutput, view: SsrDataChildRecords): boolean {
	return (
		!view.events?.length &&
		!view.behaviors?.length &&
		!view.elementHandles?.length &&
		!view.branches?.length &&
		!view.asyncBoundaries?.length &&
		!child.state?.cells?.length &&
		!child.state?.computed?.length &&
		!child.propEvents?.length
	);
}

// The `{children}` slot is an update bound to the children prop: the page's own content, never a reason not to keep.
const childrenUpdates = (view: SsrDataChildView) =>
	(view.domUpdates ?? []).filter(
		(update) =>
			update.graphNodeId === `${PROTOCOL_PROP_GRAPH_NODE_PREFIX}children` ||
			(update.graphNodeId === PROTOCOL_PROPS_GRAPH_NODE_ID &&
				update.path?.[0] === 'children'),
	).length;

const OPENING_TAG = /^\s*<([a-zA-Z][\w-]*)/;
// Below this much markup a kept part saves less than its own mark costs.
const KEEP_MIN_CHARS = 512;
const NESTED_KEEP = new RegExp(` ${PROTOCOL_KEEP_ATTRIBUTE}="[0-9a-z]+"`, 'g');

/**
 * A presentational child's root element gets a hash of its markup with the page's children left out, and the element
 * holding exactly those children is marked as the page's own: equal hashes are equal bytes, so a navigation keeps the
 * element and replaces only the page's children.
 */
function keepMarked(html: string, projected: string | undefined, presentational: boolean): string {
	if (!presentational || !OPENING_TAG.test(html)) return html;
	if (!projected) return keepAt(html);
	// The page's children appear once, verbatim, as the whole content of one element; or this output is not kept.
	const start = html.indexOf(projected);
	if (start === -1 || html.indexOf(projected, start + 1) !== -1) return html;
	const end = start + projected.length;
	const tagStart = html.lastIndexOf('<', start - 1);
	const name = /^<([a-zA-Z][\w-]*)[^<>]*>$/.exec(html.slice(tagStart, start))?.[1];
	if (!name || !html.startsWith(`</${name}`, end)) return html;
	const before = html.slice(0, start - 1).replace(NESTED_KEEP, '');
	const after = html.slice(end).replace(NESTED_KEEP, '');
	if (before.length + after.length < KEEP_MIN_CHARS) return html;
	return mark(
		`${before} ${PROTOCOL_OWN_ATTRIBUTE}>${projected}${after}`,
		hashText(before + '>' + after),
	);
}

// A part kept whole: the parts kept inside it need no mark of their own.
function keepAt(html: string): string {
	const shell = html.replace(NESTED_KEEP, '');
	return shell.length < KEEP_MIN_CHARS ? html : mark(shell, hashText(shell));
}

function mark(html: string, hash: string): string {
	const root = OPENING_TAG.exec(html)!;
	const at = root.index + root[0].length;
	return `${html.slice(0, at)} ${PROTOCOL_KEEP_ATTRIBUTE}="${hash}"${html.slice(at)}`;
}

function hashText(text: string): string {
	let high = 0x811c9dc5;
	let low = 0x01000193;
	for (let at = 0; at < text.length; at++) {
		const code = text.charCodeAt(at);
		high = Math.imul(high ^ code, 0x01000193);
		low = Math.imul(low ^ code, 0x5bd1e995);
	}
	return (high >>> 0).toString(36) + (low >>> 0).toString(36);
}

// Events, DOM updates, branches and lists leave records and coordinates; a render path carries one or both, and every
// one present must be empty. A nested component's anchor is only structure.
function presentational(child: object): boolean {
	const view = (child as { readonly view?: SsrDataChildRecords }).view;
	const coordinates = (child as { readonly coordinates?: Coordinates }).coordinates;
	return (
		(!!view || !!coordinates) &&
		(!view ||
			((view.locators?.length ?? 0) <= childrenUpdates(view) &&
				(view.domUpdates?.length ?? 0) === childrenUpdates(view) &&
				(view.keyedRepeats?.length ?? 0) === 0 &&
				noResumeRecords(child as SsrDataChildOutput, view))) &&
		(!coordinates ||
			(coordinates.locators.length === 0 &&
				coordinates.anchors.every((anchor) => anchor.kind === 'child-component')))
	);
}

const keepParts: KeepParts = (html, projected, child) =>
	keepMarked(html, projected, presentational(child));

/** Installs keep-parts for every render in this process. */
export function installKeepParts(): void {
	(globalThis as { [KEEP_PARTS_HOOK]?: KeepParts })[KEEP_PARTS_HOOK] = keepParts;
}
