// Hands a kept part's live state to the next page of an in-place navigation, still off screen (see PROTOCOL_KEEP_INSTANCE_ATTRIBUTE).
import { decodePayloadScriptsWithVersion } from '../../serializer/src/protocol-client.ts';
import { marklessInstancePath } from './fns/instance-scope.ts';
import { cloneValue, moduleHref, sameValue } from './fns/shared-instances.ts';
import { readPayloadScriptsFromDocument } from './payload-document-common.ts';
import { decodeServedComputedValues, decodeStateCells } from './payload-graph-construct.ts';
import { paintValues } from './shared-swap.ts';
import type { ResumeDomElement } from './resume-types.ts';

type ResumeEntry = { readonly routeModule?: (root: object) => Promise<unknown> | undefined };
type LiveValues = { __marklessEventOnlyGraph?: Map<string, unknown> };
type Decoded = ReturnType<typeof decodePayloadScriptsWithVersion>;

export type KeptCarry = {
	// A handler changed a cell this read while it painted: the painted page is behind, so the swap carries again.
	readonly moved: () => boolean;
	// Gives the container the carried values once the leaving page is gone.
	readonly install: (container: Element) => void;
	// Puts back what the carry painted over on the next page, before it carries again.
	readonly restore: () => void;
};

/**
 * Before the swap: which kept parts carry state, what the next page's instance of each starts from, and the
 * next page painted with it.
 */
export async function carryKeptParts(input: {
	readonly outgoing: Element;
	readonly incoming: Element;
	readonly containerAttribute: string;
	readonly resumeAttribute: string;
	// The instance path of each kept part with state on the leaving page, and of the part the swap keeps it as.
	readonly pairs: ReadonlyArray<{ readonly from: string; readonly to: string }>;
}): Promise<KeptCarry | undefined> {
	const containerOf = (region: Element) =>
		region.hasAttribute(input.containerAttribute)
			? region
			: region.querySelector(`[${input.containerAttribute}]`);
	const live = (containerOf(input.outgoing) as LiveValues | null)?.__marklessEventOnlyGraph;
	// Nothing resumed on the leaving page, so every kept part still shows what it was served.
	if (!live) return undefined;
	const { pairs } = input;
	if (pairs.length === 0) return undefined;
	const leaving = decoded(input.outgoing);
	const arriving = decoded(input.incoming);
	if (!leaving || !arriving) return undefined;
	const served = new Map(
		(await decodeStateCells(leaving.state)).map((cell) => [cell.graphNodeId, cell.value]),
	);
	const cells = [
		...(await decodeStateCells(arriving.state)),
		...(await decodeServedComputedValues(arriving.state)),
	];
	const outsideInstances = new Set(
		(arriving.state.sharedDefinitions ?? []).flatMap((definition) =>
			definition.scope === 'widget' ? [] : definition.graphNodeIds,
		),
	);
	const values = new Map<string, unknown>();
	const read = new Map<string, unknown>();
	const now = (id: string, served: unknown) =>
		live.has(id) ? live.get(id) : (live.get(id) ?? served);
	for (const cell of cells) {
		const pair = pairs.find(({ to }) => cell.graphNodeId.startsWith(to));
		if (!pair || outsideInstances.has(cell.graphNodeId) || !ownState(cell.graphNodeId))
			continue;
		const from = pair.from + cell.graphNodeId.slice(pair.to.length);
		if (!served.has(from)) continue;
		const before = served.get(from);
		const current = now(from, before);
		read.set(from, cloneValue(current));
		const value = carried(current, before, cell.value);
		if (!sameValue(value, cell.value)) values.set(cell.graphNodeId, value);
	}
	if (values.size === 0) return undefined;
	const url = input.incoming
		.querySelector(`[${input.resumeAttribute}]`)
		?.getAttribute(input.resumeAttribute);
	const root = (containerOf(input.incoming) ?? input.incoming) as unknown as ResumeDomElement;
	const route = url
		? ((await ((await import(/* @vite-ignore */ moduleHref(url))) as ResumeEntry).routeModule?.(
				root,
			)) as
				| {
						readonly loadSymbol?: unknown;
						readonly default?: { readonly loadSymbol?: unknown };
				  }
				| undefined)
		: undefined;
	const load = route?.loadSymbol ?? route?.default?.loadSymbol;
	if (typeof load !== 'function') return undefined;
	const before = new Map<
		Element,
		readonly [Array<readonly [string, string]>, Array<readonly [ChildNode, string | null]>]
	>();
	const restore = () => {
		for (const [element, [attributes, children]] of before) {
			for (const name of element.getAttributeNames()) element.removeAttribute(name);
			for (const [name, value] of attributes) element.setAttribute(name, value);
			for (const [node, data] of children) if (data !== null) (node as Text).data = data;
			element.replaceChildren(...children.map(([node]) => node));
		}
	};
	const touched = (element: unknown) => {
		if ((element as Node | undefined)?.nodeType !== 1 || before.has(element as Element)) return;
		const host = element as Element;
		before.set(host, [
			[...host.attributes].map((attribute) => [attribute.name, attribute.value] as const),
			[...host.childNodes].map((node) => [
				node,
				node.nodeType === 3 ? (node as Text).data : null,
			]),
		]);
	};
	const painted = await paintValues({ root, load, ...arriving, cells, values, touched });
	if (!painted) {
		restore();
		return undefined;
	}
	// A handler's first read of a computed answers from the served value, which the carried state made stale.
	const adopted = new Map(values);
	const servedNext = new Map(cells.map((cell) => [cell.graphNodeId, cell.value]));
	for (const computed of arriving.state.computed) {
		const id = computed.graphNodeId;
		if (computed.async || !pairs.some(({ to }) => id.startsWith(to))) continue;
		const value = painted.read(id);
		if (value !== undefined && !sameValue(value, servedNext.get(id))) adopted.set(id, value);
	}
	return {
		moved: () => [...read].some(([id, value]) => !sameValue(now(id, served.get(id)), value)),
		install: (container) => {
			(container as LiveValues).__marklessEventOnlyGraph = adopted;
		},
		restore,
	};
}

function decoded(region: Element): Decoded | undefined {
	try {
		return decodePayloadScriptsWithVersion(
			readPayloadScriptsFromDocument(
				region as unknown as Parameters<typeof readPayloadScriptsFromDocument>[0],
			),
			true,
		);
	} catch {
		return undefined;
	}
}

// A part's own state() cells; its props and the callbacks its parent handed it come from the next page.
const ownState = (graphNodeId: string) =>
	graphNodeId
		.slice(marklessInstancePath(graphNodeId).length)
		.replace(/^.*\//, '')
		.startsWith('state:');

const isPlain = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

// As if the next page's props had reached the live part: a value they serve differently is theirs, else the live one stays.
function carried(live: unknown, before: unknown, next: unknown): unknown {
	if (sameValue(before, next)) return live;
	if (!isPlain(live) || !isPlain(before) || !isPlain(next)) return next;
	const merged: Record<string, unknown> = {};
	for (const key of Object.keys(next))
		merged[key] = sameValue(before[key], next[key]) && key in live ? live[key] : next[key];
	return merged;
}

const shapeNode = (node: Node | null): Node | null => {
	while (node && node.nodeType !== 1 && node.nodeType !== 8) node = node.nextSibling;
	return node;
};

/** Whether `to` holds the same elements and comments as `from`, outside `own` elements: what a part's state may have changed since it was served. */
export function sameShape(from: Node, to: Node, own: string): boolean {
	if ((from as Element).hasAttribute?.(own)) return true;
	let left = shapeNode(from.firstChild);
	let right = shapeNode(to.firstChild);
	for (; left && right; left = shapeNode(left.nextSibling), right = shapeNode(right.nextSibling))
		if (
			left.nodeName !== right.nodeName ||
			(left.nodeType === 8 && (left as Comment).data !== (right as Comment).data) ||
			!sameShape(left, right, own)
		)
			return false;
	return !left && !right;
}

/** The text a kept part writes takes the next page's, run by run between the element's other children. */
export function keptText(d: Document, element: Element, next: Element): void {
	const runs = (node: Element) => {
		const list: ChildNode[][] = [[]];
		const others: ChildNode[] = [];
		for (const child of node.childNodes)
			if (child.nodeType === 3) list.at(-1)!.push(child);
			else {
				others.push(child);
				list.push([]);
			}
		return { list, others };
	};
	const kept = runs(element);
	const served = runs(next).list;
	if (kept.list.length !== served.length) return;
	kept.list.forEach((nodes, index) => {
		const text = served[index]!.map((node) => (node as Text).data).join('');
		if (nodes.map((node) => (node as Text).data).join('') === text) return;
		const [first, ...rest] = nodes as Text[];
		for (const extra of rest) extra.remove();
		if (first) first.data = text;
		else element.insertBefore(d.createTextNode(text), kept.others[index] ?? null);
	});
}
