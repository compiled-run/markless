import type {
	NativeExpr,
	NativeJournalEntry,
	NativeNode,
	NativeScalar,
	NativeTextPart,
	NativeViewPayload,
} from '@markless/serializer';
import { marklessAttributeValue } from '@markless/web/dom-attribute';

/** A host-side action: what a person does to a retained view. */
export type NativeAction = { readonly event: 'activate'; readonly host: string };

export type NativeRuntime = {
	/** Every shown text node's current string, in document order. */
	readonly texts: () => ReadonlyArray<readonly [node: string, text: string]>;
	/** Every shown element's bound attributes as written: null absent, "" bare. */
	readonly attributes: () => ReadonlyArray<readonly [node: string, name: string, value: string | null]>;
	/** Every shown branch's chosen arm (null: none). */
	readonly arms: () => ReadonlyArray<readonly [node: string, index: number | null]>;
	/** Runs the handler bound to the action and returns the journal the host applies. */
	readonly dispatch: (action: NativeAction) => ReadonlyArray<NativeJournalEntry>;
};

/** How a cell value reads in text: JavaScript's `String(value)`, which every host reproduces exactly. */
export const formatNativeValue = (value: NativeScalar): string => String(value);

/** The reference meaning of a payload's state, ops and journal; the Swift and Kotlin hosts are checked against it. */
export function createNativeRuntime(payload: NativeViewPayload): NativeRuntime {
	const values = new Map<string, NativeScalar>(payload.cells.map((cell) => [cell.id, cell.initial]));
	const handlers = new Map(payload.handlers.map((handler) => [handler.id, handler.ops]));
	const branches = new Map(
		payload.nodes.flatMap((node) => (node.kind === 'branch' ? [[node.id, node] as const] : [])),
	);
	const read = (cell: string): NativeScalar => {
		const value = values.get(cell);
		if (value === undefined) throw new Error(`unknown cell ${cell}`);
		return value;
	};
	const evaluate = (expr: NativeExpr): NativeScalar => {
		if ('cell' in expr) return read(expr.cell);
		if ('literal' in expr) return expr.literal;
		if ('not' in expr) return !evaluate(expr.not);
		if ('if' in expr) return evaluate(expr.if) ? evaluate(expr.whenTrue) : evaluate(expr.whenFalse);
		return evaluate(expr.equals[0]) === evaluate(expr.equals[1]);
	};
	const armOf = (branch: Extract<NativeNode, { kind: 'branch' }>): number | null =>
		evaluate(branch.test) ? 0 : branch.arms > 1 ? 1 : null;
	const shown = (node: NativeNode): boolean => {
		if (!node.arm) return true;
		const branch = branches.get(node.arm.branch);
		return !!branch && shown(branch) && armOf(branch) === node.arm.index;
	};
	const render = (parts: ReadonlyArray<NativeTextPart>): string =>
		parts
			.map((part) =>
				'text' in part
					? part.text
					: formatNativeValue('cell' in part ? read(part.cell) : evaluate(part.expr)),
			)
			.join('');

	const texts = () =>
		payload.nodes.flatMap((node) =>
			node.kind === 'text' && shown(node) ? [[node.id, render(node.parts)] as const] : [],
		);
	const attributes = () =>
		payload.nodes.flatMap((node) =>
			node.kind === 'element' && shown(node)
				? (node.bindings ?? []).map(
						(binding) =>
							[node.id, binding.attribute, marklessAttributeValue(binding.attribute, evaluate(binding.value))] as const,
					)
				: [],
		);
	const arms = () =>
		payload.nodes.flatMap((node) => (node.kind === 'branch' && shown(node) ? [[node.id, armOf(node)] as const] : []));

	return {
		texts,
		attributes,
		arms,
		dispatch(action) {
			const bound = payload.events.find((event) => event.host === action.host && event.event === action.event);
			if (!bound) throw new Error(`no ${action.event} handler on ${action.host}`);
			const beforeTexts = new Map(texts());
			const beforeAttributes = new Map(attributes().map(([node, name, value]) => [`${node}\0${name}`, value]));
			const beforeArms = new Map(arms());
			for (const op of handlers.get(bound.handler) ?? []) {
				const value = read(op.cell);
				if (op.op === 'set') values.set(op.cell, op.value);
				else if (op.op === 'toggle') values.set(op.cell, !value);
				else if (typeof value === 'number') values.set(op.cell, value + op.value);
				else throw new Error(`add on ${op.cell}, which holds a ${typeof value}`);
			}
			const afterTexts = new Map(texts());
			const afterAttributes = new Map(attributes().map(([node, name, value]) => [`${node}\0${name}`, value]));
			const afterArms = new Map(arms());
			// A node shown before and after journals its change; a newly shown arm is built from current values instead.
			return payload.nodes.flatMap((node): NativeJournalEntry[] => {
				if (node.kind === 'text') {
					const before = beforeTexts.get(node.id);
					const after = afterTexts.get(node.id);
					return before !== undefined && after !== undefined && before !== after
						? [{ op: 'text', node: node.id, value: after }]
						: [];
				}
				if (node.kind === 'branch') {
					return beforeArms.has(node.id) &&
						afterArms.has(node.id) &&
						beforeArms.get(node.id) !== afterArms.get(node.id)
						? [{ op: 'arm', node: node.id, index: afterArms.get(node.id)! }]
						: [];
				}
				return (node.bindings ?? []).flatMap((binding): NativeJournalEntry[] => {
					const key = `${node.id}\0${binding.attribute}`;
					if (!beforeAttributes.has(key) || !afterAttributes.has(key)) return [];
					const before = beforeAttributes.get(key)!;
					const after = afterAttributes.get(key)!;
					return before !== after ? [{ op: 'attribute', node: node.id, name: binding.attribute, value: after }] : [];
				});
			});
		},
	};
}
