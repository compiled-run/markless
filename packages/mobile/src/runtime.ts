import type {
	NativeBuiltin,
	NativeExpr,
	NativeJournalEntry,
	NativeNode,
	NativeTextPart,
	NativeValue,
	NativeViewPayload,
} from '@markless/serializer';
import { marklessAttributeValue } from '@markless/web/dom-attribute';

/** A host-side action: what a person does to a retained view. */
export type NativeAction =
	| { readonly event: 'activate'; readonly host: string }
	/** The field's whole text after an edit. */
	| { readonly event: 'input'; readonly host: string; readonly value: string };

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
	/** Every shown branch's chosen arm (null: none). */
	readonly arms: () => ReadonlyArray<readonly [node: string, index: number | null]>;
	/** Every shown list's row keys, in order. */
	readonly rows: () => ReadonlyArray<readonly [node: string, keys: ReadonlyArray<string>]>;
	/** Runs the handler bound to the action and returns the journal the host applies. */
	readonly dispatch: (action: NativeAction) => ReadonlyArray<NativeJournalEntry>;
	/** The page's `<title>` text, null when it has none. */
	readonly title: () => string | null;
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
	if ('cell' in expr) return read(expr.cell);
	if ('literal' in expr) return expr.literal;
	if ('event' in expr) {
		if (eventValue === undefined)
			throw new Error('the event value read outside an input handler');
		return eventValue;
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
		if ((typeof value === 'string' || Array.isArray(value)) && expr.property === 'length')
			return value.length;
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
	const base: NativeScope = { ...EMPTY_SCOPE, params };
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
		bound('property', (_name, value) => String(value ?? '')) as (readonly [
			string,
			'value',
			string,
		])[];
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

	const title = () => (payload.title ? render(payload.title, base) : null);
	/** The scope an action's element runs in: a row instance (`h6@42`) reads its row's item. */
	const scopeOf = (host: string): { node: string; scope: NativeScope } => {
		const at = host.indexOf('@');
		if (at < 0) return { node: host, scope: base };
		const node = host.slice(0, at);
		const key = host.slice(at + 1);
		const row = payload.nodes.find((candidate) => candidate.id === node)?.row;
		const repeat = row ? repeats.get(row) : undefined;
		const found =
			repeat && shown(repeat) ? rowsOf(repeat).find((entry) => entry.key === key) : undefined;
		if (!repeat || !found) throw new Error(`${host} is not a shown row instance`);
		return { node, scope: { ...base, items: new Map([[repeat.id, found.item]]) } };
	};

	return {
		texts,
		attributes,
		properties,
		arms,
		rows,
		title,
		dispatch(action) {
			const { node: host, scope } = scopeOf(action.host);
			const event = payload.events.find(
				(candidate) => candidate.host === host && candidate.event === action.event,
			);
			if (!event) throw new Error(`no ${action.event} handler on ${action.host}`);
			const eventValue = action.event === 'input' ? action.value : undefined;
			const cellsBefore = new Map(values);
			const beforeTexts = new Map(texts());
			const beforeAttributes = keyed(attributes());
			// The edited field already shows what was typed, so its own value counts as already written.
			const beforeProperties = keyed(properties());
			if (eventValue !== undefined) beforeProperties.set(`${action.host}\0value`, eventValue);
			const beforeArms = new Map(arms());
			const beforeRows = new Map(rows());
			const beforeTitle = title();
			for (const op of handlers.get(event.handler) ?? []) {
				if (op.op === 'navigate') {
					const params = Object.fromEntries(
						Object.entries(op.params).map(([name, value]) => [
							name,
							typeof value === 'string'
								? value
								: String(evaluate(value, eventValue, scope)),
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
				const value = evaluate(op.value, eventValue, scope);
				values.set(op.cell, value);
				const key = storageKeys.get(op.cell);
				if (key !== undefined) store.set(key, value);
			}
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
				if (node.kind === 'text') {
					return ids.flatMap((id): NativeJournalEntry[] => {
						const before = beforeTexts.get(id);
						const after = afterTexts.get(id);
						return before !== undefined && after !== undefined && before !== after
							? [{ op: 'text', node: id, value: after }]
							: [];
					});
				}
				return ids.flatMap((id) =>
					(node.bindings ?? []).flatMap((binding): NativeJournalEntry[] => {
						const name = 'attribute' in binding ? binding.attribute : binding.property;
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
				);
			});
			const afterTitle = title();
			return [
				...styles,
				...nodes,
				...(afterTitle !== beforeTitle && afterTitle !== null
					? [{ op: 'title' as const, value: afterTitle }]
					: []),
			];
		},
	};
}
