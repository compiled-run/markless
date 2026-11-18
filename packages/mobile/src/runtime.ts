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
import { marklessAttributeValue } from '@markless/web/dom-attribute';

/** A host-side action: what a person does to a retained view. */
export type NativeAction =
	| { readonly event: 'activate'; readonly host: string }
	/** The field's whole text after an edit. */
	| { readonly event: 'input'; readonly host: string; readonly value: string }
	/** The host's back gesture (or Escape) on an open `<dialog>`: it closes, as the browser's cancel does. */
	| { readonly event: 'cancel'; readonly host: string }
	/** The keyboard's return key in a single-line text field. */
	| { readonly event: 'enter'; readonly host: string }
	/** A `timer` journal entry's time has come: its `after` op's ops run. */
	| { readonly event: 'timer'; readonly timer: string };

type Value = NativeValue;

/** What names mean inside a list row or an arrow function: the row items by repeat id, the function's parameters. */
export type NativeScope = {
	readonly items: ReadonlyMap<string, Value>;
	readonly locals: ReadonlyMap<string, Value>;
	/** The page's route params. */
	readonly params?: Readonly<Record<string, string>>;
	/** A form's entries now, for `{ formData }`. */
	readonly formData?: (form: string) => Value;
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
	eventValue?: string,
	scope: NativeScope = EMPTY_SCOPE,
): Value {
	const evaluate = (e: NativeExpr): Value => evaluateNativeExpr(e, read, eventValue, scope);
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
						evaluateNativeExpr(argument.body, read, eventValue, {
							items: scope.items,
							...(scope.params ? { params: scope.params } : {}),
							locals: new Map([
								...scope.locals,
								...argument.lambda.map(
									(name, i) => [name, values[i] ?? null] as const,
								),
							]),
							...(scope.formData ? { formData: scope.formData } : {}),
						})
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
	if ('cell' in expr) return read(expr.cell);
	if ('literal' in expr) return expr.literal;
	if ('formData' in expr) {
		if (!scope.formData)
			throw new Error(`the entries of ${expr.formData} read outside a runtime`);
		return scope.formData(expr.formData);
	}
	if ('event' in expr) {
		if (eventValue === undefined)
			throw new Error('the event value read outside an input handler');
		return eventValue;
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
	const base: NativeScope = { ...EMPTY_SCOPE, params, formData: (form) => entriesOf(form) };
	const values = new Map<string, Value>(
		payload.cells.map((cell) => [
			cell.id,
			cell.storage && store.has(cell.storage.key)
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
	const evaluate = (expr: NativeExpr, eventValue?: string, scope?: NativeScope): Value =>
		evaluateNativeExpr(expr, read, eventValue, scope ?? base);
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
			scope: { ...base, items: new Map([[repeat.id, item]]) },
		}));
	};
	const render = (parts: ReadonlyArray<NativeTextPart>, scope: NativeScope): string =>
		parts
			.map((part) =>
				'text' in part
					? part.text
					: formatNativeValue(
							'cell' in part
								? read(part.cell)
								: evaluate(part.expr, undefined, scope),
						),
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
	const nodesById = new Map(payload.nodes.map((node) => [node.id, node]));
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
	const checkedOf = (id: string): boolean => {
		const binding = propertyBinding(id, 'checked');
		return binding ? Boolean(evaluate(binding.value)) : attributeNow(id, 'checked') !== null;
	};
	function entriesOf(id: string): Value {
		const form = forms.get(id);
		if (!form) throw new Error(`${id} is not a form`);
		return form.fields.flatMap(({ node, kind }): Value[] => {
			const name = attributeNow(node, 'name');
			if (!shown(elementOf(node)) || attributeNow(node, 'disabled') !== null || !name)
				return [];
			if (kind === 'checkbox')
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
			if (attributeNow(node, 'disabled') !== null || attributeNow(node, 'required') === null)
				return false;
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
	const keyed = <T>(list: ReadonlyArray<readonly [string, string, T]>) =>
		new Map(list.map(([node, name, value]) => [`${node}\0${name}`, value]));

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
		rows,
		dispatch(action) {
			const event =
				action.event === 'timer'
					? undefined
					: payload.events.find(
							(candidate) =>
								candidate.host === action.host && candidate.event === action.event,
						);
			const timer = action.event === 'timer' ? timers.get(action.timer) : undefined;
			if (action.event === 'timer') {
				if (!timer) throw new Error(`no timer ${action.timer} is set`);
				timers.delete(action.timer);
			} else if (action.event === 'cancel') {
				if (dialogs.get(action.host) !== true)
					throw new Error(`${action.host} is not an open dialog`);
			} else if (!event) throw new Error(`no ${action.event} handler on ${action.host}`);
			const dialogsBefore = new Map(dialogs);
			if (action.event === 'cancel') dialogs.set(action.host, false);
			const eventValue = action.event === 'input' ? action.value : undefined;
			const cellsBefore = new Map(values);
			const beforeTexts = new Map(texts());
			const beforeAttributes = keyed(attributes());
			const beforeMarks = marks();
			// The edited field already shows what was typed, so its own value counts as already written.
			const beforeProperties = keyed(properties());
			if (action.event === 'input') {
				beforeProperties.set(`${action.host}\0value`, action.value);
				edited.set(action.host, action.value);
			}
			const beforeArms = new Map(arms());
			const beforeRows = new Map(rows());
			const commands: NativeJournalEntry[] = [];
			const later: NativeJournalEntry[] = [];
			type Context = {
				readonly locals: ReadonlyMap<string, Value>;
				readonly submission?: Submission;
			};
			const settled = (submission: Submission | undefined) => {
				if (!submission || submission.pending > 0) return;
				for (const [form, runs] of running) {
					const left = runs.filter((run) => run !== submission);
					if (left.length > 0) running.set(form, left);
					else running.delete(form);
				}
			};
			const submit = (
				op: Extract<NativeOp, { op: 'submit' }>,
				context: Context,
			): NativeJournalEntry | undefined => {
				const form = forms.get(op.form);
				if (!form) throw new Error(`${op.form} is not a form`);
				if (op.submitter !== null && attributeNow(op.submitter, 'disabled') !== null)
					return undefined;
				const invalid = firstInvalid(op.form, op.submitter);
				if (invalid) {
					later.push({ op: 'invalid', node: invalid.node, message: invalid.missing });
					return undefined;
				}
				const sent = JSON.stringify(entriesOf(op.form));
				const runs = running.get(op.form) ?? [];
				// The same entries from the same button as a submission still running: the web drops it before any handler hears it.
				if (runs.some((run) => run.sent === sent && run.submitter === op.submitter))
					return undefined;
				const handler = payload.events.find(
					(candidate) => candidate.host === op.form && candidate.event === 'submit',
				);
				if (!handler) throw new Error(`${op.form} has no submit handler`);
				const submission: Submission = {
					sent,
					submitter: op.submitter,
					marks: op.submitter !== null && !form.authoredAriaDisabled,
					pending: 0,
				};
				running.set(op.form, [...runs, submission]);
				const navigated = run(handlers.get(handler.handler) ?? [], {
					locals: context.locals,
					submission,
				});
				settled(submission);
				return navigated;
			};
			const run = (
				ops: ReadonlyArray<NativeOp>,
				context: Context,
			): NativeJournalEntry | undefined => {
				const scope: NativeScope = { ...base, locals: context.locals };
				for (const op of ops) {
					if (op.op === 'command') {
						commands.push({
							op: 'command',
							node: op.node,
							command: op.command,
							...(op.preventScroll ? { preventScroll: true as const } : {}),
						});
						continue;
					}
					if (op.op === 'navigate')
						return { op: 'navigate', route: op.route, params: op.params };
					if (op.op === 'dialog') {
						if (!dialogs.has(op.node)) throw new Error(`${op.node} is not a dialog`);
						dialogs.set(op.node, op.method === 'showModal');
						continue;
					}
					if (op.op === 'if') {
						const taken = run(
							evaluate(op.test, eventValue, scope) ? op.whenTrue : op.whenFalse,
							context,
						);
						if (taken) return taken;
						continue;
					}
					if (op.op === 'submit') {
						const taken = submit(op, context);
						if (taken) return taken;
						continue;
					}
					if (op.op === 'after') {
						const ms = evaluate(op.ms, eventValue, scope);
						const locals = new Map(context.locals);
						for (const [name, value] of op.capture)
							locals.set(name, evaluate(value, eventValue, scope));
						const id = `timer:${timerCount++}`;
						timers.set(id, {
							ops: op.ops,
							locals,
							...(context.submission ? { submission: context.submission } : {}),
						});
						if (context.submission) context.submission.pending++;
						later.push({
							op: 'timer',
							timer: id,
							ms: typeof ms === 'number' && ms > 0 ? ms : 0,
						});
						continue;
					}
					const value = evaluate(op.value, eventValue, scope);
					values.set(op.cell, value);
					const key = storageKeys.get(op.cell);
					if (key !== undefined) store.set(key, value);
				}
				return undefined;
			};
			const navigated = timer
				? (() => {
						const taken = run(timer.ops, {
							locals: timer.locals,
							...(timer.submission ? { submission: timer.submission } : {}),
						});
						if (timer.submission) {
							timer.submission.pending--;
							settled(timer.submission);
						}
						return taken;
					})()
				: event
					? run(handlers.get(event.handler) ?? [], { locals: new Map() })
					: undefined;

			if (navigated) return [navigated];
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
			const afterMarks = marks();
			const marked = [...afterMarks].flatMap(([key, value]): NativeJournalEntry[] => {
				if (beforeMarks.get(key) === value) return [];
				const [node, name] = key.split('\0') as [string, string];
				return [{ op: 'attribute', node, name, value }];
			});
			// A field whose binding wrote it shows that value now, not what was typed before.
			for (const entry of nodes) if (entry.op === 'property') edited.delete(entry.node);
			return [...styles, ...nodes, ...marked, ...commands, ...later];
		},
	};
}
