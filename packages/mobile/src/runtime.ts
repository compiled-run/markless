import type {
	NativeBuiltin,
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
type Value = NativeScalar | null;

/** How a value reads in text: JavaScript's `String(value)`, which every host reproduces exactly. */
export const formatNativeValue = (value: Value): string => String(value);

const BUILTINS: { readonly [name in NativeBuiltin]: (...args: Value[]) => Value } = {
	String: (value) => String(value),
	Number: (value) => Number(value),
	Boolean: (value) => Boolean(value),
	'Math.abs': (value) => Math.abs(value as number),
	'Math.floor': (value) => Math.floor(value as number),
	'Math.max': (...values) => Math.max(...(values as number[])),
	'Math.min': (...values) => Math.min(...(values as number[])),
	'Math.round': (value) => Math.round(value as number),
};

/** The meaning of an expression: JavaScript's own, run here so the hosts have one definition to match. */
export function evaluateNativeExpr(expr: NativeExpr, read: (cell: string) => Value): Value {
	const evaluate = (e: NativeExpr): Value => evaluateNativeExpr(e, read);
	if ('cell' in expr) return read(expr.cell);
	if ('literal' in expr) return expr.literal;
	if ('unary' in expr) {
		const value = evaluate(expr.value);
		return expr.unary === '!' ? !value : expr.unary === '-' ? -(value as number) : +(value as number);
	}
	if ('binary' in expr) {
		const left = evaluate(expr.left) as never;
		const right = evaluate(expr.right) as never;
		switch (expr.binary) {
			case '+': return left + right;
			case '-': return left - right;
			case '*': return left * right;
			case '/': return left / right;
			case '%': return left % right;
			case '===': return left === right;
			case '!==': return left !== right;
			case '<': return left < right;
			case '<=': return left <= right;
			case '>': return left > right;
			case '>=': return left >= right;
		}
	}
	if ('logical' in expr) {
		const left = evaluate(expr.left);
		if (expr.logical === '&&') return left ? evaluate(expr.right) : left;
		if (expr.logical === '||') return left ? left : evaluate(expr.right);
		return left ?? evaluate(expr.right);
	}
	if ('if' in expr) return evaluate(expr.if) ? evaluate(expr.whenTrue) : evaluate(expr.whenFalse);
	if ('template' in expr) return expr.template.map((part) => (typeof part === 'string' ? part : String(evaluate(part)))).join('');
	if ('member' in expr) {
		const value = evaluate(expr.member);
		if (typeof value !== 'string') throw new Error(`.length of a ${value === null ? 'null' : typeof value}`);
		return value.length;
	}
	return BUILTINS[expr.call](...expr.arguments.map(evaluate));
}

/** The reference meaning of a payload's state, ops and journal; the Swift and Kotlin hosts are checked against it. */
export function createNativeRuntime(
	payload: NativeViewPayload,
	/** The device's kept values by storage key; read at mount, written on every change, kept across launches. */
	store: Map<string, Value> = new Map(),
): NativeRuntime {
	const values = new Map<string, Value>(
		payload.cells.map((cell) => [
			cell.id,
			cell.storage && store.has(cell.storage.key) ? store.get(cell.storage.key)! : cell.initial,
		]),
	);
	const storageKeys = new Map(payload.cells.flatMap((cell) => (cell.storage ? [[cell.id, cell.storage.key] as const] : [])));
	const handlers = new Map(payload.handlers.map((handler) => [handler.id, handler.ops]));
	const branches = new Map(
		payload.nodes.flatMap((node) => (node.kind === 'branch' ? [[node.id, node] as const] : [])),
	);
	const read = (cell: string): Value => {
		if (!values.has(cell)) throw new Error(`unknown cell ${cell}`);
		return values.get(cell)!;
	};
	const evaluate = (expr: NativeExpr): Value => evaluateNativeExpr(expr, read);
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
			const cellsBefore = new Map(values);
			const beforeTexts = new Map(texts());
			const beforeAttributes = new Map(attributes().map(([node, name, value]) => [`${node}\0${name}`, value]));
			const beforeArms = new Map(arms());
			for (const op of handlers.get(bound.handler) ?? []) {
				const value = evaluate(op.value);
				values.set(op.cell, value);
				const key = storageKeys.get(op.cell);
				if (key !== undefined) store.set(key, value);
			}
			const afterTexts = new Map(texts());
			const afterAttributes = new Map(attributes().map(([node, name, value]) => [`${node}\0${name}`, value]));
			const afterArms = new Map(arms());
			const styles = payload.cells.flatMap((cell): NativeJournalEntry[] =>
				cell.styled && cellsBefore.get(cell.id) !== values.get(cell.id)
					? [{ op: 'state', cell: cell.id, value: values.get(cell.id)! }]
					: [],
			);
			// A node shown before and after journals its change; a newly shown arm is built from current values instead.
			return [...styles, ...payload.nodes.flatMap((node): NativeJournalEntry[] => {
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
			})];
		},
	};
}
