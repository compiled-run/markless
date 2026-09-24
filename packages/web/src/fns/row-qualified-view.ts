import type { SsrDataReadContext, SsrDataStructure } from '../ssr-data/renderer.ts';
import { marklessRowSegment } from './instance-scope.ts';

type HostedRecord = { readonly hostNodeId: string };
type RowQualifiableView = {
	readonly locators: ReadonlyArray<HostedRecord>;
	readonly events: ReadonlyArray<HostedRecord>;
	readonly domUpdates: ReadonlyArray<HostedRecord>;
	readonly behaviors: ReadonlyArray<HostedRecord>;
	readonly elementHandles: ReadonlyArray<HostedRecord>;
};

const ROW_SEGMENT = /^r:[^:]*:/;

/**
 * One copy of a record per keyed row that rendered its projected host behind the
 * row's segment. Only a component that projects elements into its rows emits a
 * call, so no other page carries this code.
 */
export function marklessSsrRowQualifiedView<T extends RowQualifiableView>(
	structure: SsrDataStructure,
	view: T,
	idPrefix = '',
): T {
	const own = new Set(view.locators.map((locator) => locator.hostNodeId)),
		rows = new Map<string, string[]>();
	for (const { hostNodeId } of structure.locators) {
		const local = hostNodeId.slice(idPrefix.length),
			bare = local.replace(ROW_SEGMENT, '');
		if (bare !== local && own.has(bare) && hostNodeId.startsWith(idPrefix))
			rows.set(bare, [...(rows.get(bare) ?? []), local]);
	}
	if (!rows.size) return view;
	const perRow = <R extends HostedRecord>(records: ReadonlyArray<R>): R[] =>
		records.flatMap(
			(record) =>
				rows.get(record.hostNodeId)?.map((hostNodeId) => ({ ...record, hostNodeId })) ?? [record],
		);
	return {
		...view,
		locators: perRow(view.locators),
		events: perRow(view.events),
		domUpdates: perRow(view.domUpdates),
		behaviors: perRow(view.behaviors),
		elementHandles: perRow(view.elementHandles),
	};
}

/** Each keyed row renders its projection anew, so its elements take the row segment a placed component takes. */
export function marklessRowProjectionSegment(context: SsrDataReadContext): {
	readonly hostSegment?: string;
} {
	const hostSegment =
		context.hostSegment ??
		(context.repeatKey === undefined ? undefined : marklessRowSegment(context.repeatKey));
	return hostSegment ? { hostSegment } : {};
}

/** What a render-data definition carries for a component whose rows project elements. */
export const marklessRowHosts = {
	qualify: marklessSsrRowQualifiedView,
	segment: marklessRowProjectionSegment,
};
