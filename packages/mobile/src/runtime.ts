import type {
	NativeBuiltin,
	NativeExpr,
	NativeJournalEntry,
	NativeNode,
	NativeOp,
	NativeTextPart,
	NativeValue,
	NativeViewPayload,
} from '@markless/serializer';
import { NATIVE_DOCUMENT_BODY } from '@markless/serializer/native-view';
import { marklessAttributeValue } from '@markless/web/dom-attribute';
import {
	OVERLAY_ATTRIBUTE,
	OVERLAY_MODAL_ATTRIBUTE,
	OVERLAY_MODAL_VALUE,
} from '@markless/web/fns/overlay-protocol';

/** A host-side action: what a person does to a retained view. */
export type NativeAction =
	| { readonly event: 'activate'; readonly host: string }
	/** The field's whole text after an edit. */
	| { readonly event: 'input'; readonly host: string; readonly value: string }
	/** The host's back gesture (or Escape) on an open `<dialog>`: it closes, as the browser's cancel does. */
	| { readonly event: 'cancel'; readonly host: string }
	/**
	 * The host's back gesture (Escape) while an overlay is open: reported to `host`, the topmost one. An outside press is
	 * not sent: the runtime reports it from `pointerdown`, as the web's overlay behaviour does.
	 */
	| { readonly event: 'dismiss'; readonly host: string; readonly reason: 'escape' }
	/** A touch going down or up on the element `host` (the innermost element under it). */
	| { readonly event: 'pointerdown' | 'pointerup'; readonly host: string };

/** What the event running a handler carries, by the field a `{ event }` expression names. */
export type NativeEventFields = {
	readonly value?: string;
	readonly reason?: string;
	readonly pressTarget?: string | null;
	readonly target?: string;
	readonly button?: number;
};

/** The element facts an expression reads: focus, each overlay's focus origin, and the element tree. */
export type NativeElements = {
	readonly focused: () => string | null;
	readonly focusOrigin: (overlay: string) => string | null;
	readonly isElement: (id: string) => boolean;
	readonly contains: (within: string, node: string) => boolean;
};

type Value = NativeValue;

/** What names mean inside a list row or an arrow function: the row items by repeat id, the function's parameters. */
export type NativeScope = {
	readonly items: ReadonlyMap<string, Value>;
	readonly locals: ReadonlyMap<string, Value>;
	/** The page's route params. */
	readonly params?: Readonly<Record<string, string>>;
};

const EMPTY_SCOPE: NativeScope = { items: new Map(), locals: new Map() };

export type NativeRuntime = {
	/** Every shown text node's current string, in document order. */
	readonly texts: () => ReadonlyArray<readonly [node: string, text: string]>;
	/** Every shown element's bound attributes as written: null absent, "" bare. */
	readonly attributes: () => ReadonlyArray<
		readonly [node: string, name: string, value: string | null]
	>;
	/** Every shown input's bound `value`, as `String(value)`. */
	readonly properties: () => ReadonlyArray<readonly [node: string, name: 'value', value: string]>;
	/** Every `<dialog>` and whether it is open in the top layer. */
	readonly dialogs: () => ReadonlyArray<readonly [node: string, open: boolean]>;
	/** The overlay stack, topmost last: each element marked `overlay` that is shown, and whether it is modal. */
	readonly overlays: () => ReadonlyArray<readonly [node: string, modal: boolean]>;
	/** The element that has focus, or null. */
	readonly focused: () => string | null;
	/** Every shown branch's chosen arm (null: none). */
	readonly arms: () => ReadonlyArray<readonly [node: string, index: number | null]>;
	/** Every shown list's row keys, in order. */
	readonly rows: () => ReadonlyArray<readonly [node: string, keys: ReadonlyArray<string>]>;
	/** Runs the handler bound to the action and returns the journal the host applies. */
	readonly dispatch: (action: NativeAction) => ReadonlyArray<NativeJournalEntry>;
};

/** How a value reads in text, as the web writes it (`marklessCsrText`): null is empty, anything else `String(value)`. */
export const formatNativeValue = (value: Value): string => (value === null ? '' : String(value));

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
export function evaluateNativeExpr(
	expr: NativeExpr,
	read: (cell: string) => Value,
	/** The event's fields; a string is an `input` event's text. */
	eventValue?: string | NativeEventFields,
	scope: NativeScope = EMPTY_SCOPE,
	elements?: NativeElements,
): Value {
	const evaluate = (e: NativeExpr): Value => evaluateNativeExpr(e, read, eventValue, scope, elements);
	const dom = (): NativeElements => {
		if (!elements) throw new Error('an element read where there are no elements');
		return elements;
	};
	if ('focused' in expr) return dom().focused() ?? NATIVE_DOCUMENT_BODY;
	if ('focusOrigin' in expr) {
		const overlay = evaluate(expr.focusOrigin);
		return typeof overlay === 'string' ? dom().focusOrigin(overlay) : null;
	}
	if ('isElement' in expr) {
		const value = evaluate(expr.isElement);
		return typeof value === 'string' && dom().isElement(value);
	}
	if ('contains' in expr) {
		const within = evaluate(expr.contains);
		const node = evaluate(expr.node);
		return typeof within === 'string' && typeof node === 'string' && dom().contains(within, node);
	}
	if ('route' in expr) {
		if (!scope.params) throw new Error('route params read on a component that is not a page');
		return { ...scope.params };
	}
	if ('item' in expr) {
		if (!scope.items.has(expr.item)) throw new Error(`the row item of ${expr.item} read outside its row`);
		return scope.items.get(expr.item)!;
	}
	if ('local' in expr) {
		if (!scope.locals.has(expr.local)) throw new Error(`the parameter ${expr.local} read outside its function`);
		return scope.locals.get(expr.local)!;
	}
	if ('array' in expr)
		return expr.array.flatMap((item) => {
			const value = evaluate(item.value);
			if (!item.spread) return [value];
			if (!Array.isArray(value)) throw new Error('a spread of a value that is not an array');
			return value;
		});
	if ('object' in expr) return Object.fromEntries(expr.object.map(([key, value]) => [key, evaluate(value)]));
	if ('lambda' in expr) throw new Error('a function value outside a method call');
	if ('method' in expr) {
		const target = evaluate(expr.target);
		const args = expr.arguments.map((argument) =>
			'lambda' in argument
				? (...values: Value[]) =>
						evaluateNativeExpr(
							argument.body,
							read,
							eventValue,
							{
								items: scope.items,
								...(scope.params ? { params: scope.params } : {}),
								locals: new Map([...scope.locals, ...argument.lambda.map((name, i) => [name, values[i] ?? null] as const)]),
							},
							elements,
						)
				: evaluate(argument),
		);
		const method = (target as unknown as Record<string, unknown> | null)?.[expr.method];
		if ((typeof target !== 'string' && !Array.isArray(target)) || typeof method !== 'function')
			throw new Error(`.${expr.method}() of a ${target === null ? 'null' : typeof target}`);
		const result = (method as (...a: unknown[]) => unknown).apply(target, args) as Value | undefined;
		if (result === undefined) throw new Error(`.${expr.method}() gave undefined`);
		return result;
	}
	if ('cell' in expr) return read(expr.cell);
	if ('literal' in expr) return expr.literal;
	if ('event' in expr) {
		const fields: NativeEventFields | undefined = typeof eventValue === 'string' ? { value: eventValue } : eventValue;
		const value = fields?.[expr.event];
		if (value === undefined) throw new Error(`the event's ${expr.event} read where the event has none`);
		return value;
	}
	if ('unary' in expr) {
		const value = evaluate(expr.value);
		return expr.unary === '!'
			? !value
			: expr.unary === '-'
				? -(value as number)
				: +(value as number);
	}
	if ('binary' in expr) {
		const left = evaluate(expr.left) as never;
		const right = evaluate(expr.right) as never;
		switch (expr.binary) {
			case '+':
				return left + right;
			case '-':
				return left - right;
			case '*':
				return left * right;
			case '/':
				return left / right;
			case '%':
				return left % right;
			case '===':
				return left === right;
			case '!==':
				return left !== right;
			case '<':
				return left < right;
			case '<=':
				return left <= right;
			case '>':
				return left > right;
			case '>=':
				return left >= right;
		}
	}
	if ('logical' in expr) {
		const left = evaluate(expr.left);
		if (expr.logical === '&&') return left ? evaluate(expr.right) : left;
		if (expr.logical === '||') return left ? left : evaluate(expr.right);
		return left ?? evaluate(expr.right);
	}
	if ('if' in expr) return evaluate(expr.if) ? evaluate(expr.whenTrue) : evaluate(expr.whenFalse);
	if ('template' in expr)
		return expr.template
			.map((part) => (typeof part === 'string' ? part : String(evaluate(part))))
			.join('');
	if ('member' in expr) {
		const value = evaluate(expr.member);
		if ((typeof value === 'string' || Array.isArray(value)) && expr.property === 'length') return value.length;
		if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, expr.property))
			return (value as Record<string, Value>)[expr.property]!;
		throw new Error(`.${expr.property} of a value that has none`);
	}
	return BUILTINS[expr.call](...expr.arguments.map(evaluate));
}

/** The reference meaning of a payload's state, ops and journal; the Swift and Kotlin hosts are checked against it. */
export function createNativeRuntime(
	payload: NativeViewPayload,
	/** The device's kept values by storage key; read at mount, written on every change, kept across launches. */
	store: Map<string, Value> = new Map(),
	/** The route params the page opened with. */
	params: Readonly<Record<string, string>> = {},
): NativeRuntime {
	const base: NativeScope = { ...EMPTY_SCOPE, params };
	const values = new Map<string, Value>(
		payload.cells.map((cell) => [
			cell.id,
			cell.storage && store.has(cell.storage.key) ? store.get(cell.storage.key)! : cell.initial,
		]),
	);
	const storageKeys = new Map(
		payload.cells.flatMap((cell) => (cell.storage ? [[cell.id, cell.storage.key] as const] : [])),
	);
	const handlers = new Map(payload.handlers.map((handler) => [handler.id, handler.ops]));
	/** Each `<dialog>`'s top-layer state; every dialog mounts closed. */
	const dialogs = new Map<string, boolean>(
		payload.nodes.flatMap((node): [string, boolean][] =>
			node.kind === 'element' && node.element === 'dialog' ? [[node.id, false]] : [],
		),
	);
	const branches = new Map(
		payload.nodes.flatMap((node) => (node.kind === 'branch' ? [[node.id, node] as const] : [])),
	);
	const repeats = new Map(
		payload.nodes.flatMap((node) => (node.kind === 'repeat' ? [[node.id, node] as const] : [])),
	);
	const read = (cell: string): Value => {
		if (!values.has(cell)) throw new Error(`unknown cell ${cell}`);
		return values.get(cell)!;
	};
	const nodesById = new Map(payload.nodes.map((node) => [node.id, node]));
	/** Focus, the overlay stack (topmost last) and each overlay's focus origin, kept as the web's overlay behaviour keeps them. */
	let focused: string | null = null;
	let stack: string[] = [];
	const origins = new Map<string, string>();
	const elements: NativeElements = {
		focused: () => focused,
		focusOrigin: (overlay) => origins.get(overlay) ?? null,
		isElement: (id) => id === NATIVE_DOCUMENT_BODY || nodesById.get(id)?.kind === 'element',
		contains: (within, node) => {
			if (within === NATIVE_DOCUMENT_BODY) return true;
			for (let at: string | null | undefined = node; at; at = nodesById.get(at)?.parent)
				if (at === within) return true;
			return false;
		},
	};
	const evaluate = (expr: NativeExpr, eventValue?: string | NativeEventFields, scope?: NativeScope): Value =>
		evaluateNativeExpr(expr, read, eventValue, scope ?? base, elements);
	const armOf = (branch: Extract<NativeNode, { kind: 'branch' }>): number | null => {
		if (branch.test) return evaluate(branch.test) ? 0 : branch.arms > 1 ? 1 : null;
		const tests = branch.tests ?? [];
		const chosen = tests.findIndex((test) => test !== null && evaluate(test));
		if (chosen >= 0) return chosen;
		const fallback = tests.indexOf(null);
		return fallback >= 0 ? fallback : null;
	};
	const shown = (node: NativeNode): boolean => {
		if (!node.arm) return true;
		const branch = branches.get(node.arm.branch);
		return !!branch && shown(branch) && armOf(branch) === node.arm.index;
	};
	/** A row's key as hosts and journal entries spell it: `String()` of the item's key path. */
	const rowsOf = (repeat: Extract<NativeNode, { kind: 'repeat' }>) => {
		const list = evaluate(repeat.list);
		if (!Array.isArray(list)) throw new Error(`${repeat.id} lists a value that is not an array`);
		return list.map((item) => {
			let key: Value = item;
			for (const step of repeat.key) {
				if (key === null || typeof key !== 'object' || Array.isArray(key) || !Object.hasOwn(key, step))
					throw new Error(`${repeat.id}: a row has no key at ${repeat.key.join('.')}`);
				key = (key as Record<string, Value>)[step]!;
			}
			return { key: String(key), item };
		});
	};
	/** Every instance of a node now shown: one outside lists, one per row inside one (`<id>@<key>`). */
	const instances = (node: NativeNode): { readonly id: string; readonly scope: NativeScope }[] => {
		if (!shown(node)) return [];
		if (!node.row) return [{ id: node.id, scope: base }];
		const repeat = repeats.get(node.row);
		if (!repeat || !shown(repeat)) return [];
		return rowsOf(repeat).map(({ key, item }) => ({
			id: `${node.id}@${key}`,
			scope: { ...base, items: new Map([[repeat.id, item]]) },
		}));
	};
	const render = (parts: ReadonlyArray<NativeTextPart>, scope: NativeScope): string =>
		parts
			.map((part) =>
				'text' in part
					? part.text
					: formatNativeValue('cell' in part ? read(part.cell) : evaluate(part.expr, undefined, scope)),
			)
			.join('');

	const texts = () =>
		payload.nodes.flatMap((node) =>
			node.kind === 'text'
				? instances(node).map(({ id, scope }) => [id, render(node.parts, scope)] as const)
				: [],
		);
	const bound = <K extends 'attribute' | 'property', T>(
		kind: K,
		write: (name: string, value: Value) => T,
	): (readonly [string, string, T])[] =>
		payload.nodes.flatMap((node) =>
			node.kind === 'element'
				? instances(node).flatMap(({ id, scope }) =>
						(node.bindings ?? []).flatMap((binding) => {
							if (!(kind in binding)) return [];
							const name = 'attribute' in binding ? binding.attribute : binding.property;
							return [[id, name, write(name, evaluate(binding.value, undefined, scope))] as const];
						}),
					)
				: [],
		);
	const attributes = () => bound('attribute', (name, value) => marklessAttributeValue(name, value));
	const properties = () =>
		bound('property', (_name, value) => String(value ?? '')) as (readonly [string, 'value', string])[];
	const arms = () =>
		payload.nodes.flatMap((node) =>
			node.kind === 'branch' && shown(node) ? [[node.id, armOf(node)] as const] : [],
		);
	const rows = () =>
		payload.nodes.flatMap((node) =>
			node.kind === 'repeat' && shown(node)
				? [[node.id, rowsOf(node).map((row) => row.key)] as const]
				: [],
		);
	const keyed = <T,>(list: ReadonlyArray<readonly [string, string, T]>) =>
		new Map(list.map(([node, name, value]) => [`${node}\0${name}`, value]));

	// The overlay behaviour enlists an element marked `overlay` whose `hidden` binding shows it; one with no such binding never.
	const overlayNodes = payload.nodes.filter(
		(node): node is Extract<NativeNode, { kind: 'element' }> =>
			node.kind === 'element' &&
			node.attributes?.[OVERLAY_ATTRIBUTE] !== undefined &&
			(node.bindings ?? []).some((binding) => 'attribute' in binding && binding.attribute === 'hidden'),
	);
	const shownOverlays = (): string[] => {
		const now = keyed(attributes());
		return overlayNodes.flatMap((node) =>
			instances(node).length > 0 && now.get(`${node.id}\0hidden`) === null ? [node.id] : [],
		);
	};
	const isModal = (overlay: string): boolean => {
		const now = keyed(attributes());
		return payload.nodes.some((node) => {
			if (node.kind !== 'element' || !elements.contains(overlay, node.id)) return false;
			const bound = now.get(`${node.id}\0${OVERLAY_MODAL_ATTRIBUTE}`);
			return (bound !== undefined ? bound : node.attributes?.[OVERLAY_MODAL_ATTRIBUTE]) === OVERLAY_MODAL_VALUE;
		});
	};
	// Served shown: the document's focus is the body.
	for (const overlay of shownOverlays()) {
		stack.push(overlay);
		origins.set(overlay, NATIVE_DOCUMENT_BODY);
	}
	const handlerOf = (host: string, name: NativeAction['event']) =>
		payload.events.find((candidate) => candidate.host === host && candidate.event === name);

	return {
		texts,
		attributes,
		properties,
		arms,
		dialogs: () => [...dialogs],
		overlays: () => stack.map((overlay) => [overlay, isModal(overlay)] as const),
		focused: () => focused,
		rows,
		dispatch(action) {
			const event = handlerOf(action.host, action.event);
			const isPointer = action.event === 'pointerdown' || action.event === 'pointerup';
			if (action.event === 'cancel') {
				if (dialogs.get(action.host) !== true) throw new Error(`${action.host} is not an open dialog`);
			} else if (action.event === 'dismiss') {
				if (stack.at(-1) !== action.host) throw new Error(`${action.host} is not the topmost overlay`);
			} else if (isPointer) {
				if (!nodesById.has(action.host)) throw new Error(`${action.host} is not a node`);
			} else if (!event) throw new Error(`no ${action.event} handler on ${action.host}`);
			const dialogsBefore = new Map(dialogs);
			if (action.event === 'cancel') dialogs.set(action.host, false);
			// A press focuses the control it presses, as the browser does.
			if (action.event === 'activate') focused = action.host;
			const focusBefore = focused;
			const stackBefore = stack;
			const eventValue = action.event === 'input' ? action.value : undefined;
			// Handlers in the order the web runs them, each with what its event carries.
			const runs: { readonly handler: string; readonly fields?: NativeEventFields }[] = [];
			if (action.event === 'dismiss') {
				if (event) runs.push({ handler: event.handler, fields: { reason: action.reason, pressTarget: null } });
			} else if (isPointer) {
				// The behaviour's document listener hears the press first: the topmost overlay it landed outside is told.
				const top = stack.at(-1);
				const dismiss = top !== undefined && action.event === 'pointerdown' && !elements.contains(top, action.host) ? handlerOf(top, 'dismiss') : undefined;
				if (dismiss) runs.push({ handler: dismiss.handler, fields: { reason: 'outside-press', pressTarget: action.host } });
				for (let at: string | null | undefined = action.host; at; at = nodesById.get(at)?.parent) {
					const own = handlerOf(at, action.event);
					if (own) runs.push({ handler: own.handler, fields: { target: action.host, button: 0 } });
				}
			} else if (event) runs.push({ handler: event.handler, ...(eventValue !== undefined ? { fields: { value: eventValue } } : {}) });
			let focusMoved = false;
			const cellsBefore = new Map(values);
			const beforeTexts = new Map(texts());
			const beforeAttributes = keyed(attributes());
			// The edited field already shows what was typed, so its own value counts as already written.
			const beforeProperties = keyed(properties());
			if (eventValue !== undefined) beforeProperties.set(`${action.host}\0value`, eventValue);
			const beforeArms = new Map(arms());
			const beforeRows = new Map(rows());
			let fields: NativeEventFields | undefined;
			const run = (ops: ReadonlyArray<NativeOp>): NativeJournalEntry | undefined => {
				for (const op of ops) {
					if (op.op === 'navigate')
						return { op: 'navigate', route: op.route, params: op.params };
					if (op.op === 'focus') {
						const node = evaluate(op.node, fields);
						if (node === null) continue;
						if (typeof node !== 'string' || !elements.isElement(node)) throw new Error('focus() on a value that is not an element');
						// The body takes no focus; focusing an element inside a closed overlay still moves it, as the journal says.
						if (node !== NATIVE_DOCUMENT_BODY) {
							focused = node;
							focusMoved = true;
						}
						continue;
					}
					if (op.op === 'dialog') {
						if (!dialogs.has(op.node)) throw new Error(`${op.node} is not a dialog`);
						dialogs.set(op.node, op.method === 'showModal');
						continue;
					}
					if (op.op === 'if') {
						const taken = run(
							evaluate(op.test, fields) ? op.whenTrue : op.whenFalse,
						);
						if (taken) return taken;
						continue;
					}
					const value = evaluate(op.value, fields);
					values.set(op.cell, value);
					const key = storageKeys.get(op.cell);
					if (key !== undefined) store.set(key, value);
				}
				return undefined;
			};
			for (const step of runs) {
				fields = step.fields;
				const navigated = run(handlers.get(step.handler) ?? []);
				if (navigated) return [navigated];
			}
			fields = undefined;
			const shownNow = shownOverlays();
			const released = stackBefore.filter((overlay) => !shownNow.includes(overlay));
			const enlisted = shownNow.filter((overlay) => !stackBefore.includes(overlay));
			stack = [...stackBefore.filter((overlay) => shownNow.includes(overlay)), ...enlisted];
			for (const overlay of enlisted) origins.set(overlay, focusBefore ?? NATIVE_DOCUMENT_BODY);
			const afterTexts = new Map(texts());
			const afterAttributes = keyed(attributes());
			const afterProperties = keyed(properties());
			const afterArms = new Map(arms());
			const afterRows = new Map(rows());
			const styles = payload.cells.flatMap((cell): NativeJournalEntry[] =>
				cell.styled && cellsBefore.get(cell.id) !== values.get(cell.id)
					? [{ op: 'state', cell: cell.id, value: values.get(cell.id)! }]
					: [],
			);
			// A node shown before and after journals its change; a new arm or row is built from current values instead.
			const nodes = payload.nodes.flatMap((node): NativeJournalEntry[] => {
				if (node.kind === 'repeat') {
					const before = beforeRows.get(node.id);
					const after = afterRows.get(node.id);
					return before && after && before.join('\0') !== after.join('\0')
						? [{ op: 'rows', node: node.id, keys: after }]
						: [];
				}
				if (node.kind === 'branch') {
					return beforeArms.has(node.id) && afterArms.has(node.id) && beforeArms.get(node.id) !== afterArms.get(node.id)
						? [{ op: 'arm', node: node.id, index: afterArms.get(node.id)! }]
						: [];
				}
				const ids = instances(node).map((instance) => instance.id);
				const opened = node.kind === 'element' ? dialogs.get(node.id) : undefined;
				const dialog: NativeJournalEntry[] =
					opened !== undefined && opened !== dialogsBefore.get(node.id) ? [{ op: 'dialog', node: node.id, open: opened }] : [];
				if (node.kind === 'text') {
					return ids.flatMap((id): NativeJournalEntry[] => {
						const before = beforeTexts.get(id);
						const after = afterTexts.get(id);
						return before !== undefined && after !== undefined && before !== after
							? [{ op: 'text', node: id, value: after }]
							: [];
					});
				}
				return dialog.concat(ids.flatMap((id) =>
					(node.bindings ?? []).flatMap((binding): NativeJournalEntry[] => {
						const name = 'attribute' in binding ? binding.attribute : binding.property;
						const key = `${id}\0${name}`;
						const [before, after] =
							'attribute' in binding ? [beforeAttributes, afterAttributes] : [beforeProperties, afterProperties];
						if (!before.has(key) || !after.has(key) || before.get(key) === after.get(key)) return [];
						return 'attribute' in binding
							? [{ op: 'attribute', node: id, name, value: afterAttributes.get(key)! }]
							: [{ op: 'property', node: id, name: 'value', value: afterProperties.get(key)! }];
					}),
				));
			});
			const overlays: NativeJournalEntry[] = [
				...released.map((node): NativeJournalEntry => ({ op: 'overlay', node, open: false, modal: isModal(node) })),
				...enlisted.map((node): NativeJournalEntry => ({ op: 'overlay', node, open: true, modal: isModal(node) })),
			];
			const focus: NativeJournalEntry[] = focusMoved && focused !== null ? [{ op: 'focus', node: focused }] : [];
			return [...styles, ...nodes, ...overlays, ...focus];
		},
	};
}
