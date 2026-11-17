import type {
	NativeJournalEntry,
	NativeScalar,
	NativeTextPart,
	NativeViewPayload,
} from '@markless/serializer';

/** A host-side action: what a person does to a retained view. */
export type NativeAction = { readonly event: 'activate'; readonly host: string };

export type NativeRuntime = {
	/** Every text node's current string, in document order. */
	readonly texts: () => ReadonlyArray<readonly [node: string, text: string]>;
	/** Runs the handler bound to the action and returns the journal the host applies. */
	readonly dispatch: (action: NativeAction) => ReadonlyArray<NativeJournalEntry>;
};

/** How a cell value reads in text: JavaScript's `String(value)`, which every host reproduces exactly. */
export const formatNativeValue = (value: NativeScalar): string => String(value);

/** The reference meaning of a payload's state, ops and journal; the Swift and Kotlin hosts are checked against it. */
export function createNativeRuntime(payload: NativeViewPayload): NativeRuntime {
	const values = new Map<string, NativeScalar>(payload.cells.map((cell) => [cell.id, cell.initial]));
	const textNodes = payload.nodes.flatMap((node) => (node.kind === 'text' ? [node] : []));
	const handlers = new Map(payload.handlers.map((handler) => [handler.id, handler.ops]));
	const read = (cell: string): NativeScalar => {
		const value = values.get(cell);
		if (value === undefined) throw new Error(`unknown cell ${cell}`);
		return value;
	};
	const render = (parts: ReadonlyArray<NativeTextPart>): string =>
		parts.map((part) => ('text' in part ? part.text : formatNativeValue(read(part.cell)))).join('');
	const texts = () => textNodes.map((node) => [node.id, render(node.parts)] as const);

	return {
		texts,
		dispatch(action) {
			const bound = payload.events.find((event) => event.host === action.host && event.event === action.event);
			if (!bound) throw new Error(`no ${action.event} handler on ${action.host}`);
			const before = new Map(texts());
			for (const op of handlers.get(bound.handler) ?? []) {
				const value = read(op.cell);
				if (op.op === 'set') values.set(op.cell, op.value);
				else if (op.op === 'toggle') values.set(op.cell, !value);
				else if (typeof value === 'number') values.set(op.cell, value + op.value);
				else throw new Error(`add on ${op.cell}, which holds a ${typeof value}`);
			}
			return texts().flatMap(([node, text]): NativeJournalEntry[] =>
				before.get(node) === text ? [] : [{ op: 'text', node, value: text }],
			);
		},
	};
}
