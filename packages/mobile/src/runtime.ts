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
import { NATIVE_DOCUMENT_BODY, nativeLocale } from '@markless/serializer/native-view';
import { marklessAttributeValue } from '@markless/web/dom-attribute';
import {
	OVERLAY_ATTRIBUTE,
	OVERLAY_MODAL_ATTRIBUTE,
	OVERLAY_MODAL_VALUE,
} from '@markless/web/overlay-protocol';

/** A host-side action: what a person does to a retained view. */
export type NativeAction =
	| { readonly event: 'activate'; readonly host: string }
	/** The field's whole text after an edit. */
	| { readonly event: 'input'; readonly host: string; readonly value: string }
	/** A live device value changed (connectivity, permission): the host writes the device cell. */
	| { readonly event: 'device'; readonly cell: string; readonly value: Value }
	/** A device call the host started has answered: a task cell takes `{ state: 'value', value }` or the error. */
	| { readonly event: 'settle'; readonly cell: string; readonly value: Value }
	/** A device call made from a handler answered: its continuation runs with the answer. */
	| { readonly event: 'resume'; readonly continuation: string; readonly value: Value }
	/** That call failed: the rest of the handler does not run, and the nearest `@catch` around it takes the error. */
	| {
			readonly event: 'reject';
			readonly continuation: string;
			readonly error: { readonly name: string; readonly message: string };
	  }
	| {
			readonly event: 'settle';
			readonly cell: string;
			readonly error: { readonly name: string; readonly message: string };
	  }
	/** The platform closed a system sheet (swipe, back, a tap on the dimmed page); it is already closed when this runs. */
	| { readonly event: 'dismiss'; readonly host: string }
	/**
	 * The host's back gesture (Escape) while an overlay is open: reported to `host`, the topmost one. An outside press is
	 * not sent: the runtime reports it from `pointerdown`, as the web's overlay behaviour does.
	 */
	| { readonly event: 'dismiss'; readonly host: string; readonly reason: 'escape' }
	/** A touch going down or up on the element `host` (the innermost element under it). */
	| { readonly event: 'pointerdown' | 'pointerup'; readonly host: string }
	/** The host's back gesture (or Escape) on an open `<dialog>`: it closes, as the browser's cancel does. */
	| { readonly event: 'cancel'; readonly host: string }
	/** The keyboard's return key in a single-line text field. */
	| { readonly event: 'enter'; readonly host: string }
	/** A `timer` journal entry's time has come: its `after` op's ops run. */
	| { readonly event: 'timer'; readonly timer: string }
	/**
	 * The host went idle after the element appeared, or the element came on screen: its handler runs once for each shown
	 * instance (`due` lists the ones still to fire); a second one, or one for an instance not shown, changes nothing.
	 */
	| { readonly event: 'idle' | 'visible'; readonly host: string };

type Value = NativeValue;

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

/** What names mean inside a list row or an arrow function: the row items by repeat id, the function's parameters. */
export type NativeScope = {
	readonly items: ReadonlyMap<string, Value>;
	/** The row keys by repeat id, where a row's own state is read. */
	readonly keys?: ReadonlyMap<string, string>;
	readonly locals: ReadonlyMap<string, Value>;
	/** The page's route params. */
	readonly params?: Readonly<Record<string, string>>;
	/** A form's entries now, for `{ formData }`. */
	readonly formData?: (form: string) => Value;
	/** A checkbox's or radio button's checkedness now, for `{ checked }`. */
	readonly checked?: (node: string) => boolean;
	/** The device's clock, in milliseconds since 1970 (UTC). */
	readonly now?: () => number;
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
	/** Every system sheet and whether its `open` is truthy. */
	readonly sheets: () => ReadonlyArray<readonly [node: string, open: boolean]>;
	/** Every shown checkbox's and radio button's checkedness. */
	readonly checks: () => ReadonlyArray<readonly [node: string, checked: boolean]>;
	/** Runs the handler bound to the action (or writes the device or task cell it names) and returns the journal. */
	readonly dispatch: (action: NativeAction) => ReadonlyArray<NativeJournalEntry>;
	/** The page's `<title>` text, null when it has none. */
	readonly title: () => string | null;
	/** The calls a host starts at mount, one per task cell, each settling its cell. */
	readonly tasks: () => ReadonlyArray<Extract<NativeJournalEntry, { op: 'call' }>>;
	/** The shown instances with an `idle` (or `visible`) handler that has not run for them, in document order. */
	readonly due: (event: 'idle' | 'visible') => ReadonlyArray<string>;
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
	// Answered from the scope's clock below; listed so every builtin has an entry.
	'Date.now': () => Date.now(),
	'Date.toISOString': (time) => new Date(time as number).toISOString(),
};

/** The meaning of an expression: JavaScript's own, run here so the hosts have one definition to match. */
export function evaluateNativeExpr(
	expr: NativeExpr,
	read: (cell: string, scope: NativeScope) => Value,
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
		if (!scope.items.has(expr.item))
			throw new Error(`the row item of ${expr.item} read outside its row`);
		return scope.items.get(expr.item)!;
	}
	if ('local' in expr) {
		if (!scope.locals.has(expr.local))
			throw new Error(`the parameter ${expr.local} read outside its function`);
		return scope.locals.get(expr.local)!;
	}
	if ('array' in expr)
		return expr.array.flatMap((item) => {
			const value = evaluate(item.value);
			if (!item.spread) return [value];
			if (!Array.isArray(value)) throw new Error('a spread of a value that is not an array');
			return value;
		});
	if ('object' in expr)
		return Object.fromEntries(expr.object.map(([key, value]) => [key, evaluate(value)]));
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
								...(scope.now ? { now: scope.now } : {}),
								locals: new Map([
									...scope.locals,
									...argument.lambda.map(
										(name, i) => [name, values[i] ?? null] as const,
									),
								]),
								...(scope.formData ? { formData: scope.formData } : {}),
								...(scope.checked ? { checked: scope.checked } : {}),
							},
							elements,
						)
				: evaluate(argument),
		);
		const method = (target as unknown as Record<string, unknown> | null)?.[expr.method];
		if ((typeof target !== 'string' && !Array.isArray(target)) || typeof method !== 'function')
			throw new Error(`.${expr.method}() of a ${target === null ? 'null' : typeof target}`);
		const result = (method as (...a: unknown[]) => unknown).apply(target, args) as
			| Value
			| undefined;
		if (result === undefined) throw new Error(`.${expr.method}() gave undefined`);
		return result;
	}
	if ('at' in expr) {
		const list = evaluate(expr.of);
		if (!Array.isArray(list)) throw new Error('an index into a value that is not an array');
		const at = evaluate(expr.at);
		return typeof at === 'number' && Number.isInteger(at) && at >= 0 && at < list.length
			? list[at]!
			: null;
	}
	if ('cell' in expr) return read(expr.cell, scope);
	if ('literal' in expr) return expr.literal;
	if ('checked' in expr) {
		if (!scope.checked)
			throw new Error(`the checkedness of ${expr.checked} read outside a runtime`);
		return scope.checked(expr.checked);
	}
	if ('formData' in expr) {
		if (!scope.formData)
			throw new Error(`the entries of ${expr.formData} read outside a runtime`);
		return scope.formData(expr.formData);
	}
	if ('event' in expr) {
		const fields: NativeEventFields | undefined =
			typeof eventValue === 'string' ? { value: eventValue } : eventValue;
		const value = fields?.[expr.event];
		if (value === undefined) throw new Error(`the event's ${expr.event} read where the event has none`);
		return value;
	}
	if ('unary' in expr) {
		const value = evaluate(expr.value);
		if (expr.unary === 'typeof') return typeof value;
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
		if ((typeof value === 'string' || Array.isArray(value)) && expr.property === 'length')
			return value.length;
		const index = Number(expr.property);
		if (
			Array.isArray(value) &&
			Number.isInteger(index) &&
			index >= 0 &&
			String(index) === expr.property
		)
			return value[index] ?? null;
		if (
			value !== null &&
			typeof value === 'object' &&
			!Array.isArray(value) &&
			Object.hasOwn(value, expr.property)
		)
			return (value as Record<string, Value>)[expr.property]!;
		throw new Error(`.${expr.property} of a value that has none`);
	}
	if (expr.call === 'Date.now') return (scope.now ?? Date.now)();
	return BUILTINS[expr.call](...expr.arguments.map(evaluate));
}

/** The reference meaning of a payload's state, ops and journal; the Swift and Kotlin hosts are checked against it. */
export function createNativeRuntime(
	payload: NativeViewPayload,
	/** The device's kept values by storage key; read at mount, written on every change, kept across launches. */
	store: Map<string, Value> = new Map(),
	/** The route params the page opened with. */
	params: Readonly<Record<string, string>> = {},
	/** The device's preferred languages, most preferred first: the web's messages are shown in the first one it has. */
	preferredLanguages: ReadonlyArray<string> = ['en'],
	/** The device's clock; a conformance run fixes it. */
	now: () => number = Date.now,
): NativeRuntime {
	const base: NativeScope = {
		...EMPTY_SCOPE,
		params,
		formData: (form) => entriesOf(form),
		checked: (node) => checkedOf(node),
		now,
	};
	const values = new Map<string, Value>(
		payload.cells.map((cell) => [
			cell.id,
			cell.clock
				? now()
				: cell.storage && store.has(cell.storage.key)
					? store.get(cell.storage.key)!
					: cell.initial,
		]),
	);
	const storageKeys = new Map(
		payload.cells.flatMap((cell) =>
			cell.storage ? [[cell.id, cell.storage.key] as const] : [],
		),
	);
	const handlers = new Map(payload.handlers.map((handler) => [handler.id, handler.ops]));
	/** Every `after` of every call op, by id: what runs when a host resumes it. */
	const continuations = new Map<
		string,
		NonNullable<Extract<NativeOp, { op: 'call' }>['after']>
	>();
	const collectThen = (ops: ReadonlyArray<NativeOp>): void => {
		for (const op of ops)
			if (op.op === 'call' && op.after) {
				continuations.set(op.after.id, op.after);
				collectThen(op.after.ops);
			}
	};
	for (const handler of payload.handlers) collectThen(handler.ops);
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
	const rowOfCell = new Map(payload.cells.flatMap((cell) => (cell.row ? [[cell.id, cell.row] as const] : [])));
	/** Where a cell's value is kept: its id, or `<id>@<key>` for a row's own state, read in that row. */
	const slotOf = (cell: string, scope: NativeScope): string => {
		const row = rowOfCell.get(cell);
		if (row === undefined) return cell;
		const key = scope.keys?.get(row);
		if (key === undefined) throw new Error(`the row state ${cell} read outside its row`);
		return `${cell}@${key}`;
	};
	/** A row's state reads its first value until the row writes it. */
	const read = (cell: string, scope: NativeScope = base): Value => {
		if (!values.has(cell)) throw new Error(`unknown cell ${cell}`);
		const slot = slotOf(cell, scope);
		return values.has(slot) ? values.get(slot)! : values.get(cell)!;
	};
	/** Focus, the overlay stack (topmost last) and each overlay's focus origin, kept as the web's overlay behaviour keeps them. */
	let focused: string | null = null;
	let stack: string[] = [];
	const origins = new Map<string, string>();
	/** A row's copy (`<node>@<key>`) sits where its node does in the tree. */
	const nodeOf = (id: string) => (id.includes('@') ? id.slice(0, id.indexOf('@')) : id);
	const elements: NativeElements = {
		focused: () => focused,
		focusOrigin: (overlay) => origins.get(overlay) ?? null,
		isElement: (id) => id === NATIVE_DOCUMENT_BODY || nodesById.get(nodeOf(id))?.kind === 'element',
		contains: (within, node) => {
			if (within === NATIVE_DOCUMENT_BODY) return true;
			for (let at: string | null | undefined = nodeOf(node); at; at = nodesById.get(at)?.parent)
				if (at === nodeOf(within)) return true;
			return false;
		},
	};
	const evaluate = (
		expr: NativeExpr,
		eventValue?: string | NativeEventFields,
		scope?: NativeScope,
	): Value => evaluateNativeExpr(expr, read, eventValue, scope ?? base, elements);
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
	const nodesById = new Map(payload.nodes.map((node) => [node.id, node]));
	/** Device objects whose owning component is shown. */
	const liveObjects = (): string[] =>
		(payload.objects ?? []).flatMap((object) => {
			const owner = nodesById.get(object.owner);
			if (!owner) throw new Error(`${object.id} is owned by unknown node ${object.owner}`);
			return shown(owner) ? [object.id] : [];
		});
	/** A row's key as hosts and journal entries spell it: `String()` of the item's key path. */
	const rowsOf = (repeat: Extract<NativeNode, { kind: 'repeat' }>) => {
		const list = evaluate(repeat.list);
		if (!Array.isArray(list))
			throw new Error(`${repeat.id} lists a value that is not an array`);
		return list.map((item) => {
			let key: Value = item;
			for (const step of repeat.key) {
				if (
					key === null ||
					typeof key !== 'object' ||
					Array.isArray(key) ||
					!Object.hasOwn(key, step)
				)
					throw new Error(`${repeat.id}: a row has no key at ${repeat.key.join('.')}`);
				key = (key as Record<string, Value>)[step]!;
			}
			return { key: String(key), item };
		});
	};
	/** Every instance of a node now shown: one outside lists, one per row inside one (`<id>@<key>`). */
	const instances = (
		node: NativeNode,
	): { readonly id: string; readonly scope: NativeScope }[] => {
		if (!shown(node)) return [];
		if (!node.row) return [{ id: node.id, scope: base }];
		const repeat = repeats.get(node.row);
		if (!repeat || !shown(repeat)) return [];
		return rowsOf(repeat).map(({ key, item }) => ({
			id: `${node.id}@${key}`,
			scope: { ...base, items: new Map([[repeat.id, item]]), keys: new Map([[repeat.id, key]]) },
		}));
	};
	const render = (parts: ReadonlyArray<NativeTextPart>, scope: NativeScope): string =>
		parts
			.map((part) =>
				'text' in part
					? part.text
					: formatNativeValue('cell' in part ? read(part.cell, scope) : evaluate(part.expr, undefined, scope)),
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
							const name =
								'attribute' in binding ? binding.attribute : binding.property;
							return [
								[
									id,
									name,
									write(name, evaluate(binding.value, undefined, scope)),
								] as const,
							];
						}),
					)
				: [],
		);
	const attributes = () =>
		bound('attribute', (name, value) => marklessAttributeValue(name, value));
	const properties = () =>
		bound('property', (_name, value) => String(value ?? '')).filter(
			([, name]) => name === 'value',
		) as (readonly [string, 'value', string])[];

	// Forms: what each text field holds, which submissions are still running, and the marks they set.
	const forms = new Map((payload.forms ?? []).map((form) => [form.node, form]));
	/** A field's text a person typed since its `value` binding last changed it. */
	const edited = new Map<string, string>();
	type Submission = {
		readonly sent: string;
		readonly submitter: string | null;
		readonly marks: boolean;
		pending: number;
	};
	const running = new Map<string, Submission[]>();
	const timers = new Map<
		string,
		{
			readonly ops: ReadonlyArray<NativeOp>;
			readonly locals: ReadonlyMap<string, Value>;
			readonly submission?: Submission;
		}
	>();
	let timerCount = 0;
	const elementOf = (id: string) => {
		const node = nodesById.get(id);
		if (node?.kind !== 'element') throw new Error(`${id} is not an element`);
		return node;
	};
	/** An attribute as the web has it now: a binding's value as written, else the attribute the element was built with. */
	const attributeNow = (id: string, name: string): string | null => {
		const node = elementOf(id);
		const binding = node.bindings?.find((one) => 'attribute' in one && one.attribute === name);
		return binding
			? marklessAttributeValue(name, evaluate(binding.value))
			: (node.attributes?.[name] ?? null);
	};
	const propertyBinding = (id: string, name: string) =>
		elementOf(id).bindings?.find((one) => 'property' in one && one.property === name);
	const textOf = (id: string): string => {
		if (edited.has(id)) return edited.get(id)!;
		const binding = propertyBinding(id, 'value');
		return binding ? String(evaluate(binding.value) ?? '') : (attributeNow(id, 'value') ?? '');
	};
	const ticked = payload.nodes.flatMap((node) =>
		node.kind === 'element' &&
		node.element === 'input' &&
		!node.row &&
		(node.attributes?.['type'] === 'checkbox' || node.attributes?.['type'] === 'radio')
			? [node]
			: [],
	);
	const checkedBinding = (id: string) => {
		const binding = propertyBinding(id, 'checked');
		return binding ? Boolean(evaluate(binding.value)) : undefined;
	};
	/** Each checkbox's and radio button's checkedness: its `checked` binding sets it, as does a person's tick. */
	const checkedness = new Map(
		ticked.map(
			(node) =>
				[
					node.id,
					checkedBinding(node.id) ?? node.attributes?.['checked'] !== undefined,
				] as const,
		),
	);
	const checkedOf = (id: string): boolean => {
		if (!checkedness.has(id)) throw new Error(`${id} is not a checkbox or radio button`);
		return checkedness.get(id)!;
	};
	const formOf = (id: string) =>
		(payload.forms ?? []).find((form) => form.fields.some((field) => field.node === id))
			?.node ?? null;
	/** The radio buttons of `id`'s group: the same `name`, in the same form or in none. */
	const groupOf = (id: string) => {
		const name = attributeNow(id, 'name');
		const form = formOf(id);
		return ticked.filter(
			(node) =>
				node.id === id ||
				(node.attributes?.['type'] === 'radio' &&
					!!name &&
					attributeNow(node.id, 'name') === name &&
					formOf(node.id) === form),
		);
	};
	const messages = payload.valueMissing ?? {};
	const missing = messages[nativeLocale(preferredLanguages, Object.keys(messages))];
	function entriesOf(id: string): Value {
		const form = forms.get(id);
		if (!form) throw new Error(`${id} is not a form`);
		return form.fields.flatMap(({ node, kind }): Value[] => {
			const name = attributeNow(node, 'name');
			if (!shown(elementOf(node)) || attributeNow(node, 'disabled') !== null || !name)
				return [];
			if (kind === 'checkbox' || kind === 'radio')
				return checkedOf(node) ? [[name, attributeNow(node, 'value') ?? 'on']] : [];
			return [[name, kind === 'hidden' ? (attributeNow(node, 'value') ?? '') : textOf(node)]];
		});
	}
	/** The first field that stops a submit, with what the web says about it, or undefined when none does. */
	const firstInvalid = (id: string, submitter: string | null) => {
		const form = forms.get(id)!;
		if (
			form.noValidate ||
			(submitter !== null && attributeNow(submitter, 'formnovalidate') !== null)
		)
			return undefined;
		return form.fields.find(({ node, kind }) => {
			if (kind === 'hidden' || !shown(elementOf(node))) return false;
			if (attributeNow(node, 'disabled') !== null) return false;
			// A radio button is missing its value when any button of its group is required and none is checked.
			const required =
				kind === 'radio'
					? groupOf(node).some((member) => attributeNow(member.id, 'required') !== null)
					: attributeNow(node, 'required') !== null;
			if (!required) return false;
			if (kind === 'radio') return groupOf(node).every((member) => !checkedOf(member.id));
			return kind === 'text' ? textOf(node) === '' : !checkedOf(node);
		});
	};
	/** `aria-busy` on a form while a submission of it runs, `aria-disabled` on the button that sent a marking one. */
	const marks = () => {
		const now = new Map<string, string | null>();
		for (const form of payload.forms ?? []) {
			const runs = running.get(form.node) ?? [];
			now.set(`${form.node}\0aria-busy`, runs.length > 0 ? 'true' : null);
			if (form.authoredAriaDisabled) continue;
			for (const submitter of form.submitters)
				now.set(
					`${submitter}\0aria-disabled`,
					runs.some((run) => run.marks && run.submitter === submitter) ? 'true' : null,
				);
		}
		return now;
	};
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
	const sheets = () =>
		payload.nodes.flatMap((node) =>
			node.kind === 'sheet' ? [[node.id, Boolean(evaluate(node.open))] as const] : [],
		);
	const keyed = <T>(list: ReadonlyArray<readonly [string, string, T]>) =>
		new Map(list.map(([node, name, value]) => [`${node}\0${name}`, value]));

	const title = () => (payload.title ? render(payload.title, base) : null);
	// The overlay behaviour enlists an element marked `overlay` whose `hidden` binding shows it; one with no such binding never.
	const overlayNodes = payload.nodes.filter(
		(node): node is Extract<NativeNode, { kind: 'element' }> =>
			node.kind === 'element' &&
			!node.row &&
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
	/** The scope a shown instance's handlers run in (its row's), or undefined when it is not shown. */
	const scopeOf = (id: string): NativeScope | undefined =>
		payload.nodes
			.flatMap((node) => (node.id === nodeOf(id) ? instances(node) : []))
			.find((instance) => instance.id === id)?.scope;
	/** `idle` and `visible` handlers that ran, by `<event>\0<instance>`; an instance that leaves the screen is forgotten. */
	const fired = new Set<string>();
	const due = (event: 'idle' | 'visible'): string[] =>
		payload.events.flatMap((bound) => {
			if (bound.event !== event) return [];
			const node = nodesById.get(bound.host);
			return node ? instances(node).flatMap(({ id }) => (fired.has(`${event}\0${id}`) ? [] : [id])) : [];
		});
	const forgetHidden = () => {
		for (const key of fired) {
			const id = key.slice(key.indexOf('\0') + 1);
			const node = nodesById.get(id.split('@')[0]!);
			if (!node || !instances(node).some((shownNow) => shownNow.id === id)) fired.delete(key);
		}
	};

	return {
		texts,
		attributes: () => [
			...attributes(),
			...[...marks()].map(([key, value]) => {
				const [node, name] = key.split('\0') as [string, string];
				return [node, name, value] as const;
			}),
		],
		properties,
		arms,
		dialogs: () => [...dialogs],
		overlays: () => stack.map((overlay) => [overlay, isModal(overlay)] as const),
		focused: () => focused,
		rows,
		title,
		sheets,
		checks: () =>
			ticked.flatMap((node) => (shown(node) ? [[node.id, checkedOf(node.id)] as const] : [])),
		dispatch(action) {
			if (action.event === 'resume') {
				const continuation = continuations.get(action.continuation);
				if (!continuation) throw new Error(`no continuation ${action.continuation}`);
				const scope: NativeScope = {
					...base,
					locals: new Map([...base.locals, [continuation.as, action.value]]),
				};
				return change(undefined, undefined, () => run(continuation.ops, undefined, scope));
			}
			if (action.event === 'reject') {
				const continuation = continuations.get(action.continuation);
				if (!continuation) throw new Error(`no continuation ${action.continuation}`);
				const cell = continuation.catch;
				// With no @catch around the handler, a failed call ends it and changes nothing.
				if (cell === undefined) return [];
				return change(undefined, undefined, () => {
					values.set(cell, { name: action.error.name, message: action.error.message });
					return [];
				});
			}
			if (action.event === 'device' || action.event === 'settle') {
				const cell = payload.cells.find((candidate) => candidate.id === action.cell);
				if (action.event === 'device' ? !cell?.device : !cell?.task)
					throw new Error(
						`${action.cell} is not a ${action.event === 'device' ? 'device' : 'task'} cell`,
					);
				const value: Value =
					action.event === 'device'
						? action.value
						: 'error' in action
							? { state: 'error', error: { ...action.error } }
							: { state: 'value', value: action.value };
				return change(undefined, undefined, () => {
					values.set(action.cell, value);
					return [];
				});
			}
			if (action.event === 'cancel') {
				const host = action.host;
				if (dialogs.get(host) !== true) throw new Error(`${host} is not an open dialog`);
				const cancel = payload.events.find(
					(candidate) => candidate.host === host && candidate.event === 'cancel',
				);
				return change(host, undefined, () => {
					dialogs.set(host, false);
					return cancel ? run(handlers.get(cancel.handler) ?? [], undefined, base) : [];
				});
			}
			if (action.event === 'timer') {
				const timer = timers.get(action.timer);
				if (!timer) throw new Error(`no timer ${action.timer} is set`);
				timers.delete(action.timer);
				return change(undefined, undefined, () => {
					const out = run(timer.ops, undefined, { ...base, locals: timer.locals }, timer.submission);
					if (timer.submission) {
						timer.submission.pending--;
						settled(timer.submission);
					}
					return out;
				});
			}
			if (action.event === 'dismiss' && 'reason' in action) {
				if (stack.at(-1) !== action.host) throw new Error(`${action.host} is not the topmost overlay`);
				const dismiss = handlerOf(action.host, 'dismiss');
				const fields: NativeEventFields = { reason: action.reason, pressTarget: null };
				return change(undefined, undefined, () =>
					dismiss ? run(handlers.get(dismiss.handler) ?? [], fields, base) : [],
				);
			}
			if (action.event === 'pointerdown' || action.event === 'pointerup') {
				const press = action.event;
				const scope = scopeOf(action.host);
				if (!scope) throw new Error(`${action.host} is not shown`);
				return change(undefined, undefined, () => {
					const calls: NativeJournalEntry[] = [];
					// The behaviour's document listener hears the press first: the topmost overlay it landed outside is told.
					const top = stack.at(-1);
					const dismiss =
						top !== undefined && press === 'pointerdown' && !elements.contains(top, action.host)
							? handlerOf(top, 'dismiss')
							: undefined;
					const runs: { readonly handler: string; readonly fields: NativeEventFields }[] = [];
					if (dismiss)
						runs.push({
							handler: dismiss.handler,
							fields: { reason: 'outside-press', pressTarget: action.host },
						});
					for (let at: string | null | undefined = nodeOf(action.host); at; at = nodesById.get(at)?.parent) {
						const own = handlerOf(at, press);
						if (own) runs.push({ handler: own.handler, fields: { target: action.host, button: 0 } });
					}
					for (const step of runs) {
						const out = run(handlers.get(step.handler) ?? [], step.fields, scope);
						if (out[0]?.op === 'navigate') return out;
						calls.push(...out);
					}
					return calls;
				});
			}
			if (action.event === 'idle' || action.event === 'visible') {
				const key = `${action.event}\0${action.host}`;
				if (fired.has(key) || !due(action.event).includes(action.host)) return [];
				fired.add(key);
			}
			// A row's copy (`<node>@<key>`) runs its node's handler in that row; node ids never hold `@`.
			const at = action.host.indexOf('@');
			const host = at < 0 ? action.host : action.host.slice(0, at);
			const event = payload.events.find(
				(candidate) => candidate.host === host && candidate.event === action.event,
			);
			if (!event) throw new Error(`no ${action.event} handler on ${action.host}`);
			const instance = payload.nodes
				.flatMap((node) => (node.id === host ? instances(node) : []))
				.find((shown) => shown.id === action.host);
			if (!instance) throw new Error(`${action.host} is not shown`);
			const scope = instance.scope;
			const eventValue = action.event === 'input' ? action.value : undefined;
			// A press focuses the control it presses, as the browser does.
			if (action.event === 'activate') focused = action.host;
			return change(action.host, eventValue, () =>
				run(handlers.get(event.handler) ?? [], eventValue, scope),
			);
		},
		due,
		tasks: () =>
			payload.cells.flatMap((cell) =>
				cell.task
					? [
							{
								op: 'call' as const,
								call: cell.task.call,
								arguments: cell.task.arguments.map((argument) =>
									evaluate(argument),
								),
								result: cell.id,
							},
						]
					: [],
			),
	};

	/** Runs ops in order: writes cells, collects the calls (a continuation's id rides on its call), stops at a navigation. */
	function run(
		ops: ReadonlyArray<NativeOp>,
		eventValue: string | NativeEventFields | undefined,
		scope: NativeScope,
		submission?: Submission,
	): NativeJournalEntry[] {
		const calls: NativeJournalEntry[] = [];
		for (const op of ops) {
			if (op.op === 'submit') {
				const taken = submit(op, scope, calls);
				if (taken[0]?.op === 'navigate') return taken;
				calls.push(...taken);
				continue;
			}
			if (op.op === 'tick') {
				const group = elementOf(op.node).attributes?.['type'] === 'radio' ? groupOf(op.node) : [];
				if (group.length === 0) checkedness.set(op.node, !checkedOf(op.node));
				else for (const member of group) checkedness.set(member.id, member.id === op.node);
				continue;
			}
			if (op.op === 'after') {
				const ms = evaluate(op.ms, eventValue, scope);
				const locals = new Map(scope.locals);
				for (const [name, value] of op.capture) locals.set(name, evaluate(value, eventValue, scope));
				const id = `timer:${timerCount++}`;
				timers.set(id, { ops: op.ops, locals, ...(submission ? { submission } : {}) });
				if (submission) submission.pending++;
				calls.push({ op: 'timer', timer: id, ms: typeof ms === 'number' && ms > 0 ? ms : 0 });
				continue;
			}
			if (op.op === 'navigate') {
				const params = Object.fromEntries(
					Object.entries(op.params).map(([name, value]) => [
						name,
						typeof value === 'string' ? value : String(evaluate(value, eventValue, scope)),
					]),
				);
				return [
					{
						op: 'navigate',
						route: op.route,
						params,
						...(op.replace ? { replace: true as const } : {}),
					},
				];
			}
			if (op.op === 'command') {
				let node = op.node;
				if (typeof node !== 'string') {
					const value = evaluate(node, eventValue, scope);
					if (value === null || value === NATIVE_DOCUMENT_BODY) continue;
					if (typeof value !== 'string' || !elements.isElement(value))
						throw new Error(`${op.command}() on a value that is not an element`);
					node = value;
				}
				if (op.command === 'focus') focused = node;
				calls.push({
					op: 'command',
					node,
					command: op.command,
					...(op.preventScroll ? { preventScroll: true as const } : {}),
				});
				continue;
			}
			if (op.op === 'dialog') {
				if (!dialogs.has(op.node)) throw new Error(`${op.node} is not a dialog`);
				dialogs.set(op.node, op.method === 'showModal');
				continue;
			}
			if (op.op === 'if') {
				const taken = run(
					evaluate(op.test, eventValue, scope) ? op.whenTrue : op.whenFalse,
					eventValue,
					scope,
					submission,
				);
				if (taken[0]?.op === 'navigate') return taken;
				calls.push(...taken);
				continue;
			}
			if (op.op === 'call') {
				calls.push({
					op: 'call',
					call: op.call,
					...(op.object !== undefined ? { object: op.object } : {}),
					arguments: op.arguments.map((argument) =>
						evaluate(argument, eventValue, scope),
					),
					...(op.result !== undefined ? { result: op.result } : {}),
					...(op.after ? { resume: op.after.id } : {}),
				});
				continue;
			}
			const value = evaluate(op.value, eventValue, scope);
			values.set(slotOf(op.cell, scope), value);
			const key = storageKeys.get(op.cell);
			if (key !== undefined) store.set(key, value);
		}
		return calls;
	}

	/** A submission whose handler and timers have all run is no longer running. */
	function settled(submission: Submission | undefined) {
		if (!submission || submission.pending > 0) return;
		for (const [form, runs] of running) {
			const left = runs.filter((run) => run !== submission);
			if (left.length > 0) running.set(form, left);
			else running.delete(form);
		}
	}

	/**
	 * A `submit` op as the web runs it: nothing for a disabled submitter, an `invalid` entry for the first field missing its
	 * value, nothing for the same entries from the same button as a submission still running, else the form's handler.
	 */
	function submit(
		op: Extract<NativeOp, { op: 'submit' }>,
		scope: NativeScope,
		calls: NativeJournalEntry[],
	): NativeJournalEntry[] {
		const form = forms.get(op.form);
		if (!form) throw new Error(`${op.form} is not a form`);
		if (op.submitter !== null && attributeNow(op.submitter, 'disabled') !== null) return [];
		const invalid = firstInvalid(op.form, op.submitter);
		if (invalid) {
			if (!missing) throw new Error(`the payload has no message for a ${invalid.kind} missing its value`);
			calls.push({
				op: 'invalid',
				node: invalid.node,
				message: missing[invalid.kind as 'text' | 'checkbox' | 'radio'],
			});
			return [];
		}
		const sent = JSON.stringify(entriesOf(op.form));
		const runs = running.get(op.form) ?? [];
		if (runs.some((run) => run.sent === sent && run.submitter === op.submitter)) return [];
		const handler = payload.events.find((candidate) => candidate.host === op.form && candidate.event === 'submit');
		if (!handler) throw new Error(`${op.form} has no submit handler`);
		const submission: Submission = {
			sent,
			submitter: op.submitter,
			marks: op.submitter !== null && !form.authoredAriaDisabled,
			pending: 0,
		};
		running.set(op.form, [...runs, submission]);
		const out = run(handlers.get(handler.handler) ?? [], undefined, { ...base, locals: scope.locals }, submission);
		settled(submission);
		return out;
	}

	/**
	 * Runs `apply` (which writes cells and returns the calls it made, or a navigation that ends the page) and returns the
	 * journal: styled cells first, then every shown node whose output changed, in document order, then the calls.
	 */
	function change(
		host: string | undefined,
		eventValue: string | undefined,
		apply: () => NativeJournalEntry[],
	): ReadonlyArray<NativeJournalEntry> {
		{
			const cellsBefore = new Map(values);
			const beforeTexts = new Map(texts());
			const beforeAttributes = keyed(attributes());
			const beforeMarks = marks();
			const checkedBefore = new Map(checkedness);
			const bindingsBefore = new Map(
				ticked.map((node) => [node.id, checkedBinding(node.id)] as const),
			);
			// The edited field already shows what was typed, so its own value counts as already written.
			const beforeProperties = keyed(properties());
			if (eventValue !== undefined && host !== undefined) {
				beforeProperties.set(`${host}\0value`, eventValue);
				edited.set(host, eventValue);
			}
			const beforeArms = new Map(arms());
			const beforeRows = new Map(rows());
			const beforeTitle = title();
			const dialogsBefore = new Map(dialogs);
			const beforeSheets = new Map(sheets());
			const ownedBefore = new Set(liveObjects());
			const focusBefore = focused;
			const stackBefore = stack;
			const calls = apply();
			if (calls[0]?.op === 'navigate') return calls;
			const shownNow = shownOverlays();
			const released = stackBefore.filter((overlay) => !shownNow.includes(overlay));
			const enlisted = shownNow.filter((overlay) => !stackBefore.includes(overlay));
			stack = [...stackBefore.filter((overlay) => shownNow.includes(overlay)), ...enlisted];
			for (const overlay of enlisted) origins.set(overlay, focusBefore ?? NATIVE_DOCUMENT_BODY);
			const overlays: NativeJournalEntry[] = [
				...released.map((node): NativeJournalEntry => ({ op: 'overlay', node, open: false, modal: isModal(node) })),
				...enlisted.map((node): NativeJournalEntry => ({ op: 'overlay', node, open: true, modal: isModal(node) })),
			];
			// A row that left takes its state with it; a later row with the same key starts from the first values.
			const kept = new Set(rows().flatMap(([list, keys]) => keys.map((key) => `${list}\0${key}`)));
			for (const slot of values.keys()) {
				const at = slot.indexOf('@');
				const list = at < 0 ? undefined : rowOfCell.get(slot.slice(0, at));
				if (list !== undefined && !kept.has(`${list}\0${slot.slice(at + 1)}`)) values.delete(slot);
			}
			forgetHidden();
			const afterTexts = new Map(texts());
			const afterAttributes = keyed(attributes());
			const afterProperties = keyed(properties());
			const afterArms = new Map(arms());
			const afterRows = new Map(rows());
			const afterSheets = new Map(sheets());
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
				if (node.kind === 'sheet') {
					const open = afterSheets.get(node.id)!;
					return beforeSheets.get(node.id) !== open
						? [{ op: 'sheet', node: node.id, open }]
						: [];
				}
				if (node.kind === 'branch') {
					return beforeArms.has(node.id) &&
						afterArms.has(node.id) &&
						beforeArms.get(node.id) !== afterArms.get(node.id)
						? [{ op: 'arm', node: node.id, index: afterArms.get(node.id)! }]
						: [];
				}
				const ids = instances(node).map((instance) => instance.id);
				const opened = node.kind === 'element' ? dialogs.get(node.id) : undefined;
				const dialog: NativeJournalEntry[] =
					opened !== undefined && opened !== dialogsBefore.get(node.id)
						? [{ op: 'dialog', node: node.id, open: opened }]
						: [];
				if (node.kind === 'text') {
					return ids.flatMap((id): NativeJournalEntry[] => {
						const before = beforeTexts.get(id);
						const after = afterTexts.get(id);
						return before !== undefined && after !== undefined && before !== after
							? [{ op: 'text', node: id, value: after }]
							: [];
					});
				}
				return dialog.concat(
					ids.flatMap((id) =>
						(node.bindings ?? []).flatMap((binding): NativeJournalEntry[] => {
							const name =
								'attribute' in binding ? binding.attribute : binding.property;
							const key = `${id}\0${name}`;
							const [before, after] =
								'attribute' in binding
									? [beforeAttributes, afterAttributes]
									: [beforeProperties, afterProperties];
							if (
								!before.has(key) ||
								!after.has(key) ||
								before.get(key) === after.get(key)
							)
								return [];
							return 'attribute' in binding
								? [
										{
											op: 'attribute',
											node: id,
											name,
											value: afterAttributes.get(key)!,
										},
									]
								: [
										{
											op: 'property',
											node: id,
											name: 'value',
											value: afterProperties.get(key)!,
										},
									];
						}),
					),
				);
			});
			// A `checked` binding whose value changed sets the checkedness, as the web's property write does.
			for (const node of ticked) {
				const bound = checkedBinding(node.id);
				if (bound !== undefined && bound !== bindingsBefore.get(node.id))
					checkedness.set(node.id, bound);
			}
			const checks = ticked.flatMap((node): NativeJournalEntry[] =>
				shown(node) && checkedBefore.get(node.id) !== checkedness.get(node.id)
					? [
							{
								op: 'property',
								node: node.id,
								name: 'checked',
								value: checkedness.get(node.id)!,
							},
						]
					: [],
			);
			const afterMarks = marks();
			const marked = [...afterMarks].flatMap(([key, value]): NativeJournalEntry[] => {
				if (beforeMarks.get(key) === value) return [];
				const [node, name] = key.split('\0') as [string, string];
				return [{ op: 'attribute', node, name, value }];
			});
			const owned = new Set(liveObjects());
			const releases = (payload.objects ?? []).flatMap((object): NativeJournalEntry[] =>
				ownedBefore.has(object.id) && !owned.has(object.id)
					? [{ op: 'release', object: object.id }]
					: [],
			);
			const afterTitle = title();
			// A field whose binding wrote it shows that value now, not what was typed before.
			for (const entry of nodes) if (entry.op === 'property') edited.delete(entry.node);
			return [
				...styles,
				...nodes,
				...checks,
				...marked,
				...(afterTitle !== beforeTitle && afterTitle !== null
					? [{ op: 'title' as const, value: afterTitle }]
					: []),
				...releases,
				...overlays,
				...calls,
			];
		}
	}
}
