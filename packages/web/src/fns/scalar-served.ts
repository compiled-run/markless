import { marklessFindElementAtDomOrderIndex } from './dom-order.ts';

// Served-view ownership for per-action scalar dispatch on pages that also need full resume.
type ServedLocator = {
	readonly strategy?: string;
	readonly index: number;
	readonly tagName: string;
};
export type ServedEvent = {
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly symbolIds?: ReadonlyArray<string>;
	readonly action?: unknown;
};
export type MarklessServedDomUpdate = {
	readonly hostNodeId: string;
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
	readonly symbolId?: string;
};
type ServedView = {
	readonly s: Element;
	readonly l: Map<string, ServedLocator>;
	readonly e: ReadonlyArray<ServedEvent>;
	readonly u: ReadonlyArray<MarklessServedDomUpdate>;
	// Hosts whose behaviors or element handles the full runtime owns.
	readonly g: ReadonlyArray<string>;
	// Event names that arm-hosted or row-hosted records also listen for.
	readonly n: ReadonlySet<string>;
};
type ServedRoot = Element & { __marklessScalarView?: ServedView; __marklessCensus?: Node[] };
type ServedRows = ReadonlyArray<{ readonly rowEvents: ReadonlyArray<ServedEvent> }>;
type ServedArm = {
	readonly events?: ReadonlyArray<ServedEvent>;
	readonly keyedRepeats?: ServedRows;
};
export type MarklessScalarOwner = readonly [
	hostNodeId: string,
	eventName: string,
	symbolId: string,
];

const servedView = (r: ServedRoot): ServedView | undefined => {
	const s = r.querySelector('script[type="markless/view"]');
	if (!s) return;
	if (r.__marklessScalarView?.s === s) return r.__marklessScalarView;
	try {
		const v = JSON.parse(s.textContent || 'null') as {
			readonly locators: ReadonlyArray<ServedLocator & { readonly hostNodeId: string }>;
			readonly events: ReadonlyArray<ServedEvent>;
			readonly domUpdates?: ReadonlyArray<MarklessServedDomUpdate>;
			readonly behaviors?: ReadonlyArray<{ readonly hostNodeId: string }>;
			readonly elementHandles?: ReadonlyArray<{ readonly hostNodeId: string }>;
			readonly keyedRepeats?: ServedRows;
			readonly branches?: ReadonlyArray<{
				readonly armRecords?: ReadonlyArray<ServedArm>;
				readonly servedArmRecords?: ServedArm;
			}>;
			readonly asyncBoundaries?: ReadonlyArray<{
				readonly armRecords?: ServedArm | ReadonlyArray<ServedArm>;
			}>;
		};
		const arms: ServedArm[] = [
			...(v.branches ?? []).flatMap((b) => [
				...(b.armRecords ?? []),
				...(b.servedArmRecords ? [b.servedArmRecords] : []),
			]),
			...(v.asyncBoundaries ?? []).flatMap((b) =>
				b.armRecords ? [b.armRecords].flat() : [],
			),
		];
		const nested = [...(v.keyedRepeats ?? []), ...arms.flatMap((a) => a.keyedRepeats ?? [])];
		return (r.__marklessScalarView = {
			s,
			l: new Map(v.locators.map((l) => [l.hostNodeId, l])),
			e: v.events,
			u: v.domUpdates ?? [],
			g: [...(v.behaviors ?? []), ...(v.elementHandles ?? [])].map((h) => h.hostNodeId),
			n: new Set(
				[...nested.flatMap((k) => k.rowEvents), ...arms.flatMap((a) => a.events ?? [])].map(
					(event) => event.eventName,
				),
			),
		});
	} catch {}
};
const at = (r: ServedRoot, l: ServedLocator | undefined): Element | null => {
	if (!l || (l.strategy !== undefined && l.strategy !== 'dom-order')) return null;
	const el = marklessFindElementAtDomOrderIndex(r, l.index) as Element | undefined;
	return el?.nodeType === 1 &&
		(l.tagName === '*' || el.tagName.toLowerCase() === l.tagName.toLowerCase())
		? el
		: null;
};
const ownerOf = (record: ServedEvent, owners: ReadonlyArray<MarklessScalarOwner>): number =>
	record.action || record.symbolIds?.length !== 1
		? -1
		: owners.findIndex(
				(o) =>
					o[0] === record.hostNodeId &&
					o[1] === record.eventName &&
					o[2] === record.symbolIds![0],
			);

// Served locators when the container carries them; the compiled index otherwise (-1: none).
export const marklessScalarLocate = (
	r: ServedRoot,
	hostNodeId: string,
	index: number,
	tagName: string,
): Element | null => {
	const v = servedView(r);
	return at(r, v ? v.l.get(hostNodeId) : index < 0 ? undefined : { index, tagName });
};

// Which lean action alone owns this event's markless path: -1 hands the event to full resume, undefined means no served view.
export const marklessScalarServedOwner = (
	r: ServedRoot,
	event: Event,
	owners: ReadonlyArray<MarklessScalarOwner>,
): number | undefined => {
	const found = marklessScalarServedRecord(r, event);
	return found === undefined || found === -1 ? found : ownerOf(found, owners);
};

// The one record answering this event, with the same refusals as the owner query.
export const marklessScalarServedRecord = (
	r: ServedRoot,
	event: Event,
): ServedEvent | -1 | undefined => {
	const v = servedView(r);
	if (!v) return;
	const t = event.target as Node | null;
	if (!t?.nodeType || r.querySelector('[overlay]:not([hidden])')) return -1;
	let found: ServedEvent | undefined;
	let host: Element | null = null;
	for (const record of v.e) {
		if (record.eventName !== event.type) continue;
		const el = at(r, v.l.get(record.hostNodeId));
		if (!el) return -1;
		if (el === t || (event.bubbles !== false && el.contains(t))) {
			if (found) return -1;
			found = record;
			host = el;
		}
	}
	if (!found || (host !== t && v.n.has(event.type))) return -1;
	for (const id of v.g) {
		const el = at(r, v.l.get(id));
		if (!el || el === t || el.contains(t)) return -1;
	}
	return found;
};

// The served record of one update and its element; undefined unless exactly one record matches.
export const marklessServedDomUpdate = (
	r: ServedRoot,
	symbolId: string,
	graphNodeId: string,
	path: ReadonlyArray<string>,
): readonly [MarklessServedDomUpdate, Element] | undefined => {
	const v = servedView(r);
	if (!v) return;
	const matches = v.u.filter(
		(u) =>
			u.symbolId === symbolId &&
			u.graphNodeId === graphNodeId &&
			(u.path?.length ?? 0) === path.length &&
			path.every((part, index) => u.path![index] === part),
	);
	const el = matches.length === 1 ? at(r, v.l.get(matches[0]!.hostNodeId)) : null;
	return el ? [matches[0]!, el] : undefined;
};

// The lean actions a primed host carries, or undefined when any record on it needs full resume.
// With `routed`, a record a composed child owns answers as itself for the child's plan to decide.
export const marklessScalarServedPrime = (
	r: ServedRoot,
	element: Element | null | undefined,
	owners: ReadonlyArray<MarklessScalarOwner>,
	routed?: (record: ServedEvent) => boolean,
): Array<number | ServedEvent> | undefined => {
	const v = servedView(r);
	if (!v || !element || r.querySelector('[overlay]:not([hidden])')) return;
	let hostNodeId: string | undefined;
	for (const [id, l] of v.l)
		if (at(r, l) === element) {
			hostNodeId = id;
			break;
		}
	if (!hostNodeId || v.g.includes(hostNodeId)) return;
	const records = v.e.filter((record) => record.hostNodeId === hostNodeId);
	const primed = records.map((record) => {
		const index = ownerOf(record, owners);
		return index < 0 && routed?.(record) ? record : index;
	});
	return primed.length > 0 && primed.every((index) => typeof index !== 'number' || index >= 0)
		? primed
		: undefined;
};
