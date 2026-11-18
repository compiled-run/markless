import type {
	NativePlace,
	NativeBuiltin,
	NativeExpr,
	NativeNode,
	NativeOp,
	NativeMethod,
	NativeScalar,
	NativeValue,
	NativeTextPart,
	NativeViewPayload,
	NativeScriptBinding,
	NativeScriptService,
} from '@markless/serializer';
import {
	isNativeStyleStateAttribute,
	NATIVE_SCRIPT_EVENT_MEMBERS,
	NATIVE_SCRIPT_GLOBAL_OBJECTS,
	NATIVE_SCRIPT_HOST_GLOBALS,
	NATIVE_SCRIPT_LANGUAGE_GLOBALS,
	NATIVE_SCRIPT_PAGE_GLOBALS,
	NATIVE_VIEW_VERSION,
	PLATFORM_PIECES_NAMESPACE,
	PLATFORM_PIECES_PACKAGE,
} from '@markless/serializer/native-view';
import {
	DEVICE_CALLS,
	DEVICE_ELEMENTS,
	DEVICE_MODULE,
	DEVICE_OBJECTS,
	DEVICE_VALUES,
	type NativeDeviceCall,
	type NativeDeviceFeature,
	type NativeDeviceObject,
	type NativeDeviceValue,
} from '@markless/serializer/native-device';
import { marklessAttributeValue } from '@markless/web/dom-attribute';
import type {
	CompilerDiagnostic,
	SemanticComponentEdge,
	SemanticEvent,
	SemanticGraphArtifact,
	SemanticMarkupChunk,
	SemanticExpression,
	SemanticHandlerStatement,
	SemanticFunctionStatement,
	SemanticModuleFunction,
	SemanticSharedDefinition,
	SemanticScriptFunction,
	SemanticScriptGlobal,
	SourceSpan,
} from '../artifacts.ts';
import { nativeScriptOf, type NativeScriptModuleInput } from './native-script.ts';

export const NATIVE_UNSUPPORTED_CODE = 'MARKLESS_NATIVE_UNSUPPORTED';
/** A handler or computed that runs as JavaScript on the phone uses something no phone script has. */
export const NATIVE_SCRIPT_CODE = 'MARKLESS_NATIVE_SCRIPT';

export type NativeViewArtifact = {
	readonly passId: 'native-view';
	readonly payload: NativeViewPayload | null;
	/** The device features the payload uses, in first-use order: what the app's manifests must declare. */
	readonly features: ReadonlyArray<NativeDeviceFeature>;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
	/** Modules the build resolved but was not given an analysis of; the caller analyzes them and builds again. */
	readonly missingModules?: ReadonlyArray<string>;
};

type ElementBindings = NonNullable<Extract<NativeNode, { kind: 'element' }>['bindings']>;

/** Elements every native host maps; anything else is refused here once, not in each host. */
const PORTABLE_ELEMENTS = new Set([
	'main',
	'div',
	'section',
	'article',
	'header',
	'footer',
	'nav',
	'aside',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'span',
	'b',
	'strong',
	'em',
	'i',
	'ul',
	'ol',
	'li',
	'button',
	'input',
	'a',
	'img',
	'audio',
	'label',
	'dialog',
]);

const SEMANTIC_EVENTS: Readonly<Record<string, NativeViewPayload['events'][number]['event']>> = {
	click: 'activate',
	input: 'input',
};

/** Events a phone never fires, so their handlers are left out rather than refused: find-in-page does not exist there. */
const NOT_ON_PHONES = new Set(['beforematch']);

/**
 * Events a phone raises only from a hardware keyboard (a touch or the screen reader's cursor moves neither key nor keyboard
 * focus), except focus and blur on a text field, which the soft keyboard raises. Hosts have no hardware keyboard yet, so these
 * handlers are left out with a warning that names each one.
 */
const KEYBOARD_ONLY = new Set(['keydown', 'keyup', 'focus', 'blur', 'focusin', 'focusout']);
const TEXT_ENTRY = new Set(['input', 'textarea']);
export const NATIVE_KEYBOARD_ONLY_CODE = 'MARKLESS_NATIVE_KEYBOARD_ONLY';

type Item =
	| { readonly kind: 'host'; readonly id: string; readonly path: ReadonlyArray<number> }
	| { readonly kind: 'part'; readonly part: NativeTextPart; readonly path: ReadonlyArray<number> }
	| {
			readonly kind: 'branch';
			readonly id: string;
			readonly arms: ReadonlyArray<string>;
			readonly path: ReadonlyArray<number>;
	  }
	| {
			readonly kind: 'repeat';
			readonly id: string;
			readonly row: string;
			readonly empty?: string;
			readonly path: ReadonlyArray<number>;
	  }
	| {
			readonly kind: 'child';
			readonly edge: string;
			readonly template: string;
			readonly projection?: string;
			readonly path: ReadonlyArray<number>;
	  }
	| { readonly kind: 'children'; readonly path: ReadonlyArray<number> }
	| {
			readonly kind: 'boundary';
			readonly id: string;
			readonly arms: {
				readonly try: string;
				readonly pending?: string;
				readonly catch?: string;
			};
			readonly path: ReadonlyArray<number>;
	  };

const isNativeValue = (value: unknown): value is NativeValue =>
	value === null ||
	typeof value === 'string' ||
	typeof value === 'boolean' ||
	(typeof value === 'number' && Number.isFinite(value)) ||
	(Array.isArray(value) && value.every(isNativeValue)) ||
	(typeof value === 'object' &&
		Object.getPrototypeOf(value) === Object.prototype &&
		Object.values(value as object).every(isNativeValue));

/** What names mean where an expression is: an input handler's event, arrow parameters, and enclosing rows' items. */
/** A prop as an instance sees it: a value lowered where it was passed, or a callback lowered where it is called. */
type Prop =
	| { readonly kind: 'value'; readonly expr: NativeExpr }
	/** The markup a caller wrote between the component's tags, lowered where the component renders `{children}`. */
	| { readonly kind: 'children'; readonly chunk: SemanticMarkupChunk; readonly scope: Scope }
	| {
			readonly kind: 'callback';
			readonly statements: ReadonlyArray<SemanticHandlerStatement> | undefined;
			readonly parameters: ReadonlyArray<string>;
			readonly scope: Scope;
	  };

/** One rendered instance of a `shared()` definition: its cells, handles and methods, resolved for one subtree. */
type SharedInstance = {
	readonly definition: SemanticSharedDefinition;
	readonly module: ModuleFacts;
	readonly prefix: string;
	/** The factory's own scope, where its methods run. */
	scope: Scope;
	readonly fields: Map<string, Field>;
	/** Callback slots the widget root filled from its props (`collapsible.onChange = onChange`). */
	readonly slots: Map<string, Prop>;
};

/** What `instance.name` is. */
type Field =
	| { readonly kind: 'cell'; readonly cell: string }
	| { readonly kind: 'handle'; readonly key: string; readonly plural: boolean }
	| {
			readonly kind: 'method';
			readonly statements: ReadonlyArray<SemanticHandlerStatement> | undefined;
			readonly parameters: ReadonlyArray<string>;
	  }
	| { readonly kind: 'slot' }
	| { readonly kind: 'expr'; readonly expression: SemanticExpression | undefined };

/** A name whose members are what a native build reads: a state object split into one cell per field, or a shared instance. */
type ObjectRef =
	| {
			readonly kind: 'fields';
			readonly cells: ReadonlyMap<string, string>;
			readonly instance?: SharedInstance;
	  }
	| { readonly kind: 'instance'; readonly instance: SharedInstance };

/** What names mean where an expression is: the component whose state it reads, its props, rows' items and parameters. */
type Scope = {
	/** The analysis of the module whose template is being lowered. */
	readonly module: ModuleFacts;
	readonly component: string;
	/** This instance's cells by state name and by the analyzer's binding id. */
	readonly cells: {
		readonly byName: ReadonlyMap<string, string>;
		readonly byBinding: ReadonlyMap<string, string>;
	};
	/** Prefix of every id this component instance emits (`component-edge:0/` inside a child, empty at the root). */
	readonly prefix: string;
	readonly event?: string;
	/** A click handler's event parameter: only the fields a tap has (`pressed`) may be read. */
	readonly opaque?: string;
	/** The element a tap landed on (`event.target`) and the one whose handler runs (`event.currentTarget`). */
	readonly pressed?: { readonly target: string; readonly currentTarget: string };
	readonly locals: ReadonlySet<string>;
	readonly items: ReadonlyMap<string, string>;
	readonly props: ReadonlyMap<string, Prop>;
	/** Names whose members resolve to cells, handles and methods. */
	readonly objects: ReadonlyMap<string, ObjectRef>;
	/** Values bound to a called callback's or method's parameters, such as a sheet's `onChange` reading `false` on dismiss. */
	readonly args: ReadonlyMap<string, NativeExpr>;
	/** The shared instances of the subtree being rendered, by definition id. */
	readonly shared: ReadonlyMap<string, SharedInstance>;
	/** Props the caller passed that the component does not declare: written where it spreads `{...rest}`. */
	readonly rest?: ReadonlyArray<readonly [string, NativeExpr]>;
	/** This instance's device objects by local name (`cam`), each with its payload id. */
	readonly deviceObjects: ReadonlyMap<
		string,
		{ readonly id: string; readonly device: NativeDeviceObject }
	>;
	/** The nearest `@catch` around this markup: a handler's failed awaited device call writes its error there. */
	readonly catches?: HandlerCatch;
	/** Inside a `@try` arm: the boundary, whose task cells its reads collect, and the name `@catch` binds its error to. */
	readonly boundary?: {
		readonly tasks: Set<string>;
		readonly errorName?: string;
		readonly arm: 'try' | 'pending' | 'catch';
		readonly catches: HandlerCatch;
	};
};

/** A `@try`'s `@catch` as handlers inside its `@try` arm reach it: the cell made the first time one needs it. */
type HandlerCatch = { readonly cell: () => string; readonly used: () => boolean };

/** A call a handler or async computed makes, by the names it is called through (`['cam', 'takePhoto']`). */
type DeviceCallSite = {
	readonly callee: string;
	readonly calleePath: ReadonlyArray<string>;
	readonly arguments: ReadonlyArray<SemanticExpression>;
};

/** Calls every host implements with exact JavaScript meaning (`NativeBuiltin`). */
const BUILTINS = new Set<string>([
	'String',
	'Number',
	'Boolean',
	'Math.abs',
	'Math.floor',
	'Math.max',
	'Math.min',
	'Math.round',
] satisfies NativeBuiltin[]);

/** Methods with JavaScript meaning that return a new value; `reverse` mutates, so only a fresh array may take it. */
const METHODS = new Set<string>([
	'filter',
	'map',
	'findIndex',
	'some',
	'every',
	'includes',
	'indexOf',
	'join',
	'concat',
	'slice',
	'reverse',
	'toReversed',
	'toUpperCase',
	'toLowerCase',
	'trim',
]);

/**
 * An element as a value while a handler is lowered (a handle, `event.target`): known when the app is built, so element
 * methods (`contains`, `getAttribute`) are answered then. It never reaches a payload.
 */
type ElementValue = { readonly element: string };
const elementValue = (node: string): NativeExpr => ({ element: node }) as unknown as NativeExpr;
const elementOf = (expr: NativeExpr | null | undefined): string | undefined =>
	expr && 'element' in expr ? (expr as unknown as ElementValue).element : undefined;
/** Elements as JavaScript values while folding, so `===`, `??` and truthiness have their meaning. */
const ELEMENT_TOKENS = new Map<string, object>();
const elementToken = (node: string): object => {
	let token = ELEMENT_TOKENS.get(node);
	if (!token) ELEMENT_TOKENS.set(node, (token = { node }));
	return token;
};
const tokenElement = new WeakMap<object, string>();
/** Whether an expression holds an element value anywhere. */
function mentionsElement(expr: unknown): boolean {
	if (!expr || typeof expr !== 'object') return false;
	if ('element' in expr && typeof (expr as ElementValue).element === 'string') return true;
	return Object.values(expr).some((child) =>
		Array.isArray(child) ? child.some(mentionsElement) : mentionsElement(child),
	);
}

/** The passes of a `for...of` still to run, and the statements after it. */
type LoopPass = {
	readonly items: ReadonlyArray<unknown>;
	readonly name: string;
	readonly body: ReadonlyArray<SemanticFunctionStatement>;
	readonly after: ReadonlyArray<SemanticFunctionStatement>;
};

/** A folded value as an expression again: an element, or JSON as a literal, array or object. */
function expressionOfValue(value: unknown): NativeExpr | undefined {
	if (value && typeof value === 'object' && tokenElement.has(value)) return elementValue(tokenElement.get(value)!);
	if (isScalar(value)) return { literal: value };
	if (Array.isArray(value)) {
		const items = value.map(expressionOfValue);
		return items.every(Boolean) ? { array: items.map((item) => ({ spread: false, value: item! })) } : undefined;
	}
	if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
		const entries = Object.entries(value).map(([key, inner]) => [key, expressionOfValue(inner)] as const);
		return entries.every(([, inner]) => inner) ? { object: entries as (readonly [string, NativeExpr])[] } : undefined;
	}
	return undefined;
}

/** Where a pass of a loop over indices falls off its body without returning: on to the next index. */
const NEXT_PASS = { literal: null } as NativeExpr;

/** Modifier keys: a tap holds none. */
const TOUCH_MODIFIERS = new Set(['shiftKey', 'altKey', 'ctrlKey', 'metaKey']);

/** `a.b.c` as written, for naming a call the build refuses. */
const calleeText = (expression: SemanticExpression): string =>
	expression.kind === 'read'
		? expression.name
		: expression.kind === 'member'
			? `${calleeText(expression.object)}.${expression.property}`
			: '(value)';

/** Types whose `typeof` a native value answers exactly; `undefined` and `object` cannot be told apart from null. */
const EXACT_TYPES = new Set(['string', 'number', 'boolean']);

/** `typeof value === 'string'` (either side, `===` or `!==`) as the tested value and type, when the answer is exact. */
function typeTestOf(
	expression: Extract<SemanticExpression, { kind: 'binary' }>,
): { readonly value: SemanticExpression; readonly type: string } | undefined {
	if (expression.operator !== '===' && expression.operator !== '!==') return undefined;
	for (const [operand, other] of [
		[expression.left, expression.right],
		[expression.right, expression.left],
	] as const) {
		if (
			operand.kind === 'unary' &&
			operand.operator === 'typeof' &&
			other.kind === 'literal' &&
			typeof other.value === 'string' &&
			EXACT_TYPES.has(other.value)
		)
			return { value: operand.value, type: other.value };
	}
	return undefined;
}

const comparePaths = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number => {
	for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
	return a.length - b.length;
};

const isPrefix = (prefix: ReadonlyArray<number>, path: ReadonlyArray<number>): boolean =>
	prefix.length < path.length && prefix.every((step, i) => path[i] === step);

/** Builds the native view of a module's root component from its semantic graph, or refuses with diagnostics. */
export type NativeViewOptions = {
	/** The page's route when the module is a page: the router's pattern and its param names. */
	readonly route?: { readonly pattern: string; readonly params: ReadonlyArray<string> };
	/**
	 * Every analyzed module the build can reach, by filename, and how a specifier written in one module resolves to
	 * another's filename (relative or package). A resolved module with no analysis is reported in `missingModules`.
	 */
	readonly modules?: {
		readonly graphs: ReadonlyMap<string, SemanticGraphArtifact>;
		readonly resolve: (specifier: string, importer: string) => string | undefined;
	};
	/** An app build's routes: links and `navigate()` must name one of them, with its params. */
	readonly routes?: ReadonlyArray<{
		readonly pattern: string;
		readonly params: ReadonlyArray<string>;
	}>;
	/** Matches a path written in `navigate()` against the app's routes, as the router matches a URL. */
	readonly resolvePath?: (
		path: string,
	) =>
		| { readonly pattern: string; readonly params: Readonly<Record<string, string>> }
		| undefined;
	/**
	 * Where handlers run. `fallback` (the default): as data where they lower, else as their own JavaScript in the phone's
	 * script engine. `all`: as JavaScript wherever a script can run them, to check that both paths mean the same.
	 * `never`: data only.
	 */
	readonly scriptHandlers?: 'fallback' | 'all' | 'never';
};

/** One module's facts, indexed for lowering its templates. */
type ModuleFacts = ReturnType<typeof moduleFactsOf>;

function moduleFactsOf(graph: SemanticGraphArtifact) {
	const index = <T, K>(items: ReadonlyArray<T>, key: (item: T) => K) => {
		const map = new Map<K, T[]>();
		for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
		return map;
	};
	const propNames = new Map<string, Map<string, string>>();
	for (const binding of graph.componentPropBindings) {
		const names = propNames.get(binding.componentName) ?? new Map<string, string>();
		if (binding.propPath?.length === 1) names.set(binding.localName, binding.propPath[0]!);
		propNames.set(binding.componentName, names);
	}
	return {
		graph,
		chunks: new Map(graph.markup.chunks.map((chunk) => [chunk.id, chunk])),
		propNames,
		readsByHost: index(graph.templateReads, (read) => read.hostNodeId),
		computedReads: new Map(
			graph.templateReads.flatMap((read) =>
				read.computedGraphNodeId && read.target.kind === 'text'
					? [[read.computedGraphNodeId, read] as const]
					: [],
			),
		),
		tagOf: new Map(graph.hostNodes.map((host) => [host.id, host.tagName])),
		branchSites: new Map(graph.branchSites.map((site) => [site.id, site])),
		propBindingIds: new Set(
			graph.graphBindings.flatMap((binding) => (binding.kind === 'prop' ? [binding.id] : [])),
		),
		edgesById: new Map(graph.componentEdges.map((edge) => [edge.id, edge])),
		eventsByHost: index(graph.events, (event) => event.hostNodeId),
		repeatsById: new Map(graph.keyedRepeats.map((repeat) => [repeat.id, repeat])),
		/** Sync computeds by component, then name: a read of one inlines its expression. */
		computeds: graph.graphBindings.reduce((byComponent, binding) => {
			if (binding.kind !== 'computed') return byComponent;
			const names =
				byComponent.get(binding.componentName ?? '') ?? new Map<string, typeof binding>();
			names.set(binding.name, binding);
			return byComponent.set(binding.componentName ?? '', names);
		}, new Map<string, Map<string, SemanticGraphArtifact['graphBindings'][number]>>()),
		boundaries: new Map(graph.asyncBoundaries.map((boundary) => [boundary.id, boundary])),
		imports: new Map(
			graph.moduleImports
				.filter((entry) => !entry.typeOnly)
				.map((entry) => [entry.localName, entry]),
		),
		componentFacts: new Map(graph.components.map((component) => [component.name, component])),
		functions: new Map((graph.moduleFunctions ?? []).map((fn) => [fn.name, fn])),
		bindingsById: new Map(graph.graphBindings.map((binding) => [binding.id, binding])),
		sharedDefinitions: new Map(
			graph.sharedDefinitions.map((definition) => [definition.id, definition]),
		),
		sharedInstancesByComponent: index(
			graph.sharedInstances,
			(instance) => instance.componentName ?? '',
		),
		handleBindingsByHost: index(graph.elementHandleBindings, (binding) => binding.hostNodeId),
		elementBindings: new Map(
			graph.graphBindings.flatMap((binding) =>
				binding.kind === 'element' && !binding.sharedDefinitionId
					? [[`${binding.componentName ?? ''}#${binding.name}`, binding.id] as const]
					: [],
			),
		),
	};
}

/** The refusal a native build reports for a construct with no native lowering yet, named in `message`. */
export function nativeUnsupported(message: string, span?: SourceSpan): CompilerDiagnostic {
	return {
		code: NATIVE_UNSUPPORTED_CODE,
		severity: 'error',
		phase: 'serialization',
		title: 'This component cannot be built for a native target yet',
		message,
		why: 'Native hosts build retained views from compiler facts and run handlers as data; this construct has no native lowering yet.',
		...(span ? { primarySpan: span } : {}),
		passId: 'native-view',
		suggestions: [],
		docsUrl: `https://markless.dev/errors/${NATIVE_UNSUPPORTED_CODE}`,
	};
}

/** The refusal for what a handler or computed running as JavaScript uses and no phone script has, named in `message`. */
export function nativeScriptRefusal(message: string, span?: SourceSpan): CompilerDiagnostic {
	return {
		code: NATIVE_SCRIPT_CODE,
		severity: 'error',
		phase: 'serialization',
		title: 'This JavaScript cannot run on a phone',
		message,
		why: 'A handler that is not data runs in the phone\'s JavaScript engine, which has the language, timers, fetch and console, but no web page.',
		...(span ? { primarySpan: span } : {}),
		passId: 'native-view',
		suggestions: [],
		docsUrl: `https://markless.dev/errors/${NATIVE_SCRIPT_CODE}`,
	};
}

const LANGUAGE_GLOBALS = new Set(NATIVE_SCRIPT_LANGUAGE_GLOBALS);
const GLOBAL_OBJECTS = new Set(NATIVE_SCRIPT_GLOBAL_OBJECTS);

const isScalar = (value: unknown): value is NativeScalar | null =>
	value === null ||
	typeof value === 'string' ||
	typeof value === 'boolean' ||
	(typeof value === 'number' && Number.isFinite(value));

/** Every cell an expression reads. */
function cellsOf(expr: NativeExpr, into = new Set<string>()): Set<string> {
	if ('cell' in expr) into.add(expr.cell);
	for (const child of Object.values(expr)) {
		if (Array.isArray(child)) {
			for (const item of child)
				if (item && typeof item === 'object')
					cellsOf((Array.isArray(item) ? item[1] : item) as NativeExpr, into);
		} else if (child && typeof child === 'object') cellsOf(child as NativeExpr, into);
	}
	return into;
}

const BUILTIN_CALLS: Readonly<Record<string, (...args: never[]) => unknown>> = {
	String,
	Number,
	Boolean,
	'Math.abs': Math.abs,
	'Math.floor': Math.floor,
	'Math.max': Math.max,
	'Math.min': Math.min,
	'Math.round': Math.round,
};

/**
 * An expression's value at build time, with JavaScript's meaning, when it reads only literals and the cells' initial
 * values; `undefined` when it reads anything else. A state's first value and a widget root's seeds are made this way.
 */
function foldConstant(
	expr: NativeExpr,
	initial: (cell: string) => NativeValue | undefined,
): { readonly value: unknown } | undefined {
	const fold = (inner: NativeExpr) => foldConstant(inner, initial);
	if ('literal' in expr) return { value: expr.literal };
	const element = elementOf(expr);
	if (element !== undefined) {
		const token = elementToken(element);
		tokenElement.set(token, element);
		return { value: token };
	}
	if ('cell' in expr) {
		const value = initial(expr.cell);
		return value === undefined ? undefined : { value };
	}
	if ('unary' in expr) {
		const value = fold(expr.value);
		if (!value) return undefined;
		const v = value.value as number;
		return { value: expr.unary === '!' ? !v : expr.unary === '-' ? -v : +v };
	}
	if ('binary' in expr) {
		const left = fold(expr.left);
		const right = fold(expr.right);
		if (!left || !right) return undefined;
		const l = left.value as number;
		const r = right.value as number;
		const results: Record<string, () => unknown> = {
			'+': () => l + r,
			'-': () => l - r,
			'*': () => l * r,
			'/': () => l / r,
			'%': () => l % r,
			'===': () => l === r,
			'!==': () => l !== r,
			'<': () => l < r,
			'<=': () => l <= r,
			'>': () => l > r,
			'>=': () => l >= r,
		};
		return { value: results[expr.binary]!() };
	}
	if ('logical' in expr) {
		const left = fold(expr.left);
		if (!left) return undefined;
		const pick =
			expr.logical === '&&'
				? !left.value
				: expr.logical === '||'
					? Boolean(left.value)
					: left.value !== null && left.value !== undefined;
		return pick ? left : fold(expr.right);
	}
	if ('if' in expr) {
		const test = fold(expr.if);
		return test ? fold(test.value ? expr.whenTrue : expr.whenFalse) : undefined;
	}
	if ('template' in expr) {
		let text = '';
		for (const part of expr.template) {
			if (typeof part === 'string') text += part;
			else {
				const value = fold(part);
				if (!value) return undefined;
				text += String(value.value);
			}
		}
		return { value: text };
	}
	if ('object' in expr) {
		const object: Record<string, unknown> = {};
		for (const [key, value] of expr.object) {
			const folded = fold(value);
			if (!folded) return undefined;
			object[key] = folded.value;
		}
		return { value: object };
	}
	if ('array' in expr) {
		const array: unknown[] = [];
		for (const item of expr.array) {
			const folded = fold(item.value);
			if (!folded) return undefined;
			if (item.spread) array.push(...(folded.value as unknown[]));
			else array.push(folded.value);
		}
		return { value: array };
	}
	if ('member' in expr) {
		const object = fold(expr.member);
		if (!object) return undefined;
		const holder = object.value;
		if (holder && typeof holder === 'object' && tokenElement.has(holder)) return undefined;
		if (expr.property === 'length' && (typeof holder === 'string' || Array.isArray(holder)))
			return { value: holder.length };
		return holder && typeof holder === 'object' && Object.hasOwn(holder, expr.property)
			? { value: (holder as Record<string, unknown>)[expr.property] }
			: undefined;
	}
	if ('call' in expr) {
		const args = expr.arguments.map(fold);
		if (args.some((arg) => !arg)) return undefined;
		const call = BUILTIN_CALLS[expr.call];
		return call
			? {
					value: (call as (...values: unknown[]) => unknown)(
						...args.map((arg) => arg!.value),
					),
				}
			: undefined;
	}
	return undefined;
}

export function createNativeViewPayload(
	graph: SemanticGraphArtifact,
	options: NativeViewOptions = {},
): NativeViewArtifact {
	const diagnostics: CompilerDiagnostic[] = [];
	const missingModules = new Set<string>();
	const refuse = (message: string, span?: SourceSpan): null => {
		diagnostics.push(nativeUnsupported(message, span));
		return null;
	};
	const features = new Set<NativeDeviceFeature>();
	const keyboardOnly = (what: string, span?: SourceSpan) => {
		diagnostics.push({
			code: NATIVE_KEYBOARD_ONLY_CODE,
			severity: 'warning',
			phase: 'serialization',
			title: 'A keyboard-only handler is left out of the native build',
			message: `${what} runs only from a hardware keyboard on a phone; native hosts have none yet, so it is left out`,
			why: 'A touch or a screen reader moves neither key events nor keyboard focus on iOS and Android.',
			...(span ? { primarySpan: span } : {}),
			passId: 'native-view',
			suggestions: [],
			docsUrl: `https://markless.dev/errors/${NATIVE_KEYBOARD_ONLY_CODE}`,
		});
	};
	const done = (payload: NativeViewPayload | null): NativeViewArtifact => ({
		passId: 'native-view',
		payload: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? null : payload,
		features: [...features],
		diagnostics,
		...(missingModules.size > 0 ? { missingModules: [...missingModules] } : {}),
	});

	const root = graph.markup.root;
	if (!root) return done(refuse('the module has no root component'));
	if (graph.behaviors.length > 0) refuse('attach behaviours');
	const rootModule = moduleFactsOf(graph);
	const rootChunk = rootModule.chunks.get(root.templateId);
	if (!rootChunk) return done(refuse('the root template has no markup'));

	const moduleFactsByFile = new Map<string, ModuleFacts>([[graph.filename, rootModule]]);
	/** The module a specifier written in `importer` names, or undefined (and a request for its analysis) when not given. */
	const moduleAt = (importer: ModuleFacts, specifier: string): ModuleFacts | undefined => {
		const file = options.modules?.resolve(specifier, importer.graph.filename);
		if (file === undefined) return undefined;
		const known = moduleFactsByFile.get(file);
		if (known) return known;
		const analysis = options.modules?.graphs.get(file);
		if (!analysis) {
			missingModules.add(file);
			return undefined;
		}
		const facts = moduleFactsOf(analysis);
		moduleFactsByFile.set(file, facts);
		return facts;
	};
	type Exported =
		| { readonly kind: 'component'; readonly module: ModuleFacts; readonly component: string }
		| { readonly kind: 'namespace'; readonly module: ModuleFacts };
	/** What `name` exported from `module` is, following re-exports (`export * as base`, `export { default as button }`). */
	const exported = (module: ModuleFacts, name: string, depth = 0): Exported | undefined => {
		if (depth > 16) return undefined;
		const own = module.graph.components.find((component) => component.exportName === name);
		if (own) return { kind: 'component', module, component: own.name };
		const reexports = module.graph.moduleGraphInterface?.reexports ?? [];
		const direct = reexports.find((entry) => entry.exportName === name);
		if (direct) {
			const target = moduleAt(module, direct.source);
			if (!target) return undefined;
			return direct.importedName === '*'
				? { kind: 'namespace', module: target }
				: exported(target, direct.importedName, depth + 1);
		}
		for (const entry of reexports) {
			if (entry.exportName !== '*' || entry.source.startsWith('@markless/icons')) continue;
			const target = moduleAt(module, entry.source);
			const found = target && exported(target, name, depth + 1);
			if (found) return found;
		}
		return undefined;
	};
	/** The component a tag names in `module` (`Stepper`, `base.button`), wherever it is defined. */
	const componentAt = (
		module: ModuleFacts,
		tag: string,
	): { readonly module: ModuleFacts; readonly component: string } | undefined => {
		const [local, ...members] = tag.split('.');
		if (members.length === 0 && module.chunks.has(`template:${local}`))
			return { module, component: local! };
		const entry = module.imports.get(local ?? '');
		if (!entry) return undefined;
		const source = moduleAt(module, entry.source);
		if (!source) return undefined;
		let found: Exported | undefined =
			entry.kind === 'namespace'
				? { kind: 'namespace', module: source }
				: exported(source, entry.importedName ?? 'default');
		for (const member of members)
			found = found?.kind === 'namespace' ? exported(found.module, member) : undefined;
		return found?.kind === 'component' ? found : undefined;
	};

	type ModuleFunction = { readonly module: ModuleFacts; readonly fn: SemanticModuleFunction };
	/** The module-level function `name` exported from `module`, following re-exports. */
	const exportedFunction = (module: ModuleFacts, name: string, depth = 0): ModuleFunction | undefined => {
		if (depth > 16) return undefined;
		for (const fn of module.functions.values()) if (fn.exportNames.includes(name)) return { module, fn };
		const reexports = module.graph.moduleGraphInterface?.reexports ?? [];
		const direct = reexports.find((entry) => entry.exportName === name);
		if (direct) {
			const target = direct.importedName === '*' ? undefined : moduleAt(module, direct.source);
			return target && exportedFunction(target, direct.importedName, depth + 1);
		}
		for (const entry of reexports) {
			if (entry.exportName !== '*') continue;
			const target = moduleAt(module, entry.source);
			const found = target && exportedFunction(target, name, depth + 1);
			if (found) return found;
		}
		return undefined;
	};
	/** The function a call by bare name reaches from `module`: one it declares, or a named import of one. */
	const functionAt = (module: ModuleFacts, name: string): ModuleFunction | undefined => {
		const own = module.functions.get(name);
		if (own) return { module, fn: own };
		const entry = module.imports.get(name);
		if (entry?.kind !== 'named') return undefined;
		const source = moduleAt(module, entry.source);
		return source && exportedFunction(source, entry.importedName ?? name);
	};

	const cells: NativeViewPayload['cells'][number][] = [];
	const cellIndex = new Map<string, number>();
	const addCell = (cell: NativeViewPayload['cells'][number]) => {
		if (cellIndex.has(cell.id)) return;
		cellIndex.set(cell.id, cells.length);
		cells.push(cell);
	};
	const initialOf = (cell: string): NativeValue | undefined => {
		const index = cellIndex.get(cell);
		return index === undefined ? undefined : cells[index]!.initial;
	};
	const setInitial = (cell: string, value: NativeValue) => {
		const index = cellIndex.get(cell)!;
		cells[index] = { ...cells[index]!, initial: value };
	};
	/** A state object becomes one cell per field (`press.pressed`), so each field can change, journal and style on its own. */
	const splitCells = (
		id: string,
		name: string,
		value: Record<string, NativeValue>,
		row: string | undefined,
	): Map<string, string> => {
		const fields = new Map<string, string>();
		for (const [field, initial] of Object.entries(value)) {
			fields.set(field, `${id}.${field}`);
			addCell({ id: `${id}.${field}`, name: `${name}.${field}`, initial, ...(row ? { row } : {}) });
		}
		return fields;
	};
	const isPlainObject = (value: unknown): value is Record<string, NativeValue> =>
		isNativeValue(value) &&
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value);

	/** Cells, handles, methods and slots of one `shared()` instance, named by the component that created it. */
	const createInstance = (
		definition: SemanticSharedDefinition,
		module: ModuleFacts,
		prefix: string,
		row: string | undefined,
	): SharedInstance => {
		const owner =
			[module, ...moduleFactsByFile.values()].find((facts) =>
				facts.graph.graphBindings.some(
					(binding) => binding.sharedDefinitionId === definition.id,
				),
			) ?? module;
		const byName = new Map<string, string>();
		const byBinding = new Map<string, string>();
		const objects = new Map<string, ObjectRef>();
		const instance: SharedInstance = {
			definition,
			module: owner,
			prefix,
			scope: undefined as unknown as Scope,
			fields: new Map(),
			slots: new Map(),
		};
		const objectFields = new Map<string, Map<string, string>>();
		for (const binding of owner.graph.graphBindings) {
			if (binding.sharedDefinitionId !== definition.id || binding.kind !== 'state') continue;
			const id = `${prefix}${binding.id}`;
			const value = binding.initialValue;
			if (binding.initialValueKnown !== true || !isNativeValue(value)) {
				refuse(
					`shared state \`${binding.name}\` of ${definition.name} needs a JSON initial value known at build time`,
				);
				continue;
			}
			if (isPlainObject(value)) {
				const fields = splitCells(id, binding.name, value, row);
				objectFields.set(binding.id, fields);
				objects.set(binding.name, { kind: 'fields', cells: fields, instance });
			} else {
				addCell({ id, name: binding.name, initial: value, ...(row ? { row } : {}) });
				byName.set(binding.name, id);
				byBinding.set(binding.id, id);
			}
		}
		for (const property of definition.returnProperties ?? []) {
			if (property.kind === 'method') {
				instance.fields.set(property.name, {
					kind: 'method',
					statements: property.nativeStatements,
					parameters: property.parameters ?? [],
				});
			} else if (property.kind === 'callback-slot') {
				instance.fields.set(property.name, { kind: 'slot' });
			} else {
				const binding = owner.bindingsById.get(property.graphNodeId);
				const fields = objectFields.get(property.graphNodeId);
				if (binding?.kind === 'element')
					instance.fields.set(property.name, {
						kind: 'handle',
						key: `${prefix}${binding.id}`,
						plural: binding.plural === true,
					});
				else if (fields && property.path.length === 1 && fields.has(property.path[0]!))
					instance.fields.set(property.name, {
						kind: 'cell',
						cell: fields.get(property.path[0]!)!,
					});
				else if (byBinding.has(property.graphNodeId) && property.path.length === 0)
					instance.fields.set(property.name, {
						kind: 'cell',
						cell: byBinding.get(property.graphNodeId)!,
					});
				else if (binding?.kind === 'computed')
					instance.fields.set(property.name, {
						kind: 'expr',
						expression: binding.nativeExpression,
					});
			}
		}
		instance.scope = {
			module: owner,
			component: '',
			cells: { byName, byBinding },
			prefix,
			locals: new Set(),
			items: new Map(),
			props: new Map(),
			objects,
			args: new Map(),
			shared: new Map(),
			deviceObjects: new Map(),
		};
		return instance;
	};

	/**
	 * The scope one component instance renders in: its props, its own state (state objects split into cells), the shared
	 * instances it resolves (reusing the subtree's, or creating them), and the writes its body makes while rendering,
	 * which set those cells' first values.
	 */
	const enterComponent = (
		module: ModuleFacts,
		component: string,
		prefix: string,
		props: ReadonlyMap<string, Prop>,
		shared: ReadonlyMap<string, SharedInstance>,
		includeModuleState: boolean,
		/** The list whose rows this instance renders in: its state is per row. */
		row?: string,
	): Scope => {
		const byName = new Map<string, string>();
		const byBinding = new Map<string, string>();
		const objects = new Map<string, ObjectRef>();
		const subtree = new Map(shared);
		const scope: Scope = {
			module,
			component,
			cells: { byName, byBinding },
			prefix,
			locals: new Set(),
			items: new Map(),
			props,
			objects,
			args: new Map(),
			shared: subtree,
			deviceObjects: new Map(),
		};
		for (const use of module.sharedInstancesByComponent.get(component) ?? []) {
			const definition =
				module.sharedDefinitions.get(use.definitionId) ??
				[...moduleFactsByFile.values()]
					.map((facts) => facts.sharedDefinitions.get(use.definitionId))
					.find(Boolean);
			if (!definition) {
				refuse(
					`${component} uses ${use.definitionName}, whose shared() definition the build did not analyze`,
				);
				continue;
			}
			if (definition.scope !== 'subtree') {
				refuse(`${definition.name}: shared() with scope \`${definition.scope ?? 'app'}\``);
				continue;
			}
			const instance =
				subtree.get(definition.id) ?? createInstance(definition, module, prefix, row);
			subtree.set(definition.id, instance);
			objects.set(use.localName, { kind: 'instance', instance });
		}
		const native = module.componentFacts.get(component)?.native;
		for (const binding of module.graph.graphBindings) {
			if (binding.kind !== 'state' || binding.sharedDefinitionId) continue;
			const moduleLevel = binding.componentName === undefined;
			if (!moduleLevel && binding.componentName !== component) continue;
			if (moduleLevel && !includeModuleState) {
				refuse(`top-level state \`${binding.name}\` in an imported module`);
				continue;
			}
			if (!moduleLevel && prefix !== '' && binding.storage) {
				refuse(
					`storage \`${binding.name}\` declared inside the child component ${component}`,
				);
				continue;
			}
			const id = moduleLevel ? binding.id : `${prefix}${binding.id}`;
			let value: unknown = binding.initialValue;
			let known = binding.initialValueKnown === true;
			const initializer = native?.stateInitializers[binding.name];
			if (!known && initializer) {
				const lowered = exprOf(
					initializer,
					`the first value of \`${binding.name}\``,
					scope,
				);
				const folded = lowered && foldConstant(lowered, initialOf);
				if (folded && lowered && cellsOf(lowered).size === 0) {
					value = folded.value;
					known = true;
				}
			}
			if (!known || !isNativeValue(value)) {
				refuse(`state \`${binding.name}\` needs a JSON initial value known at build time`);
				continue;
			}
			if (row && binding.storage) {
				refuse(`storage \`${binding.name}\` of ${component}, which renders in a @for row`);
				continue;
			}
			if (isPlainObject(value) && !binding.storage) {
				objects.set(binding.name, {
					kind: 'fields',
					cells: splitCells(id, binding.name, value, row),
				});
				continue;
			}
			byName.set(binding.name, id);
			byBinding.set(binding.id, id);
			addCell({
				id,
				name: binding.name,
				initial: value,
				...(binding.storage ? { storage: { key: binding.storage.key } } : {}),
				...(row ? { row } : {}),
			});
		}
		for (const statement of native?.renderStatements ?? []) seed(statement, scope);
		return scope;
	};

	/** A write a widget root makes while rendering: a cell's first value, or a callback slot filled from a prop. */
	const seed = (statement: SemanticHandlerStatement, scope: Scope) => {
		const what = `${scope.component} while rendering`;
		if (statement.kind !== 'assign' || statement.path?.length !== 1) {
			refuse(
				`${what} runs ${statement.kind === 'unsupported' ? statement.construct : `a ${statement.kind} statement`}`,
			);
			return;
		}
		const object = scope.objects.get(statement.target);
		const fieldName = statement.path[0]!;
		const instance = object?.kind === 'instance' ? object.instance : object?.instance;
		const field = object?.kind === 'fields' ? undefined : instance?.fields.get(fieldName);
		if (
			field?.kind === 'slot' ||
			(object?.kind === 'fields' && instance?.fields.get(fieldName)?.kind === 'slot')
		) {
			const value = statement.value;
			const prop = value.kind === 'read' ? propOf(value.name, scope) : undefined;
			if (prop?.kind === 'callback') instance!.slots.set(fieldName, prop);
			else if (!(value.kind === 'read' && isPropName(value.name, scope)))
				refuse(
					`${what} fills \`${statement.target}.${fieldName}\` with something other than a callback prop`,
				);
			return;
		}
		const cell =
			object?.kind === 'fields'
				? object.cells.get(fieldName)
				: field?.kind === 'cell'
					? field.cell
					: undefined;
		if (!cell) {
			refuse(`${what} writes \`${statement.target}.${fieldName}\`, which is not state`);
			return;
		}
		const lowered = exprOf(
			statement.value,
			`${what}, \`${statement.target}.${fieldName}\``,
			scope,
		);
		if (!lowered) return;
		const folded = foldConstant(lowered, initialOf);
		if (!folded || cellsOf(lowered).size > 0 || !isNativeValue(folded.value)) {
			refuse(
				`${what} sets \`${statement.target}.${fieldName}\` from a value that follows state; pass a fixed value or leave the prop out`,
			);
			return;
		}
		setInitial(cell, folded.value);
	};

	const propOf = (name: string, scope: Scope): Prop | undefined =>
		scope.props.get(scope.module.propNames.get(scope.component)?.get(name) ?? '');
	const isPropName = (name: string, scope: Scope): boolean =>
		scope.module.propNames.get(scope.component)?.has(name) === true;

	const cellOf = (name: string, scope: Scope): string | undefined => scope.cells.byName.get(name);
	const isRouterLink = (scope: Scope, name: string): boolean => {
		const entry = scope.module.imports.get(name);
		return entry?.source === '@markless/router' && entry.importedName === 'Link';
	};
	/** A link's params: strings fixed at build time, or values this build computes when the link is followed. */
	const linkParams = (
		prop: SemanticGraphArtifact['componentEdges'][number]['props'][number],
		scope: Scope,
	): Record<string, string | NativeExpr> | null => {
		const fixed =
			prop.kind === 'opaque'
				? prop.buildTimeValue?.value
				: prop.kind === 'serializable'
					? prop.value
					: undefined;
		if (
			fixed &&
			typeof fixed === 'object' &&
			Object.values(fixed).every((value) => typeof value === 'string')
		)
			return fixed as Record<string, string>;
		const tree = 'nativeExpression' in prop ? prop.nativeExpression : undefined;
		if (tree?.kind !== 'object') return null;
		const entries: [string, string | NativeExpr][] = [];
		for (const [name, value] of tree.entries) {
			const lowered = exprOf(value, `the link param \`${name}\``, scope);
			if (!lowered) return null;
			entries.push([
				name,
				'literal' in lowered && typeof lowered.literal === 'string'
					? lowered.literal
					: lowered,
			]);
		}
		return Object.fromEntries(entries);
	};
	/** A link or `navigate()` target as a route pattern and params, checked against the app's routes when they are known. */
	const linkRoute = (
		pattern: string,
		params: Record<string, string | NativeExpr>,
	): { route: string; params: Record<string, string | NativeExpr> } | null => {
		const known = options.routes?.find((route) => route.pattern === pattern);
		if (options.routes && !known)
			return refuse(`a link to ${pattern}, which is not a route of this app`);
		const names = Object.keys(params).sort().join(',');
		if (known && [...known.params].sort().join(',') !== names)
			return refuse(
				`a link to ${pattern} with the params ${names || 'none'}, not ${known.params.join(', ') || 'none'}`,
			);
		return { route: pattern, params };
	};
	const isPlatformSheet = (edge: SemanticComponentEdge): boolean =>
		edge.importSource === PLATFORM_PIECES_PACKAGE &&
		edge.importedName === PLATFORM_PIECES_NAMESPACE &&
		edge.importedMemberPath?.length === 1 &&
		edge.importedMemberPath[0] === 'sheet';
	/** `haptics.tap` for `['haptics', 'tap']` when `haptics` is this module's import from `@markless/device`. */
	const deviceName = (path: ReadonlyArray<string>, scope: Scope): string | undefined => {
		const [local, property, ...rest] = path;
		if (
			local === undefined ||
			property === undefined ||
			rest.length > 0 ||
			scope.locals.has(local)
		)
			return undefined;
		const entry = scope.module.imports.get(local);
		return entry?.source === DEVICE_MODULE && entry.importedName
			? `${entry.importedName}.${property}`
			: undefined;
	};
	/** `haptics.tap(...)` or `cam.takePhoto(...)`: a method called on a name, as the device reads it. */
	const methodCallSite = (expression: SemanticExpression | undefined): DeviceCallSite | null =>
		expression?.kind === 'method' && expression.object.kind === 'read'
			? {
					callee: `${expression.object.name}.${expression.method}`,
					calleePath: [expression.object.name, expression.method],
					arguments: expression.arguments,
				}
			: null;
	/** Whether a call site names `@markless/device` or one of this instance's device objects. */
	const isDeviceCallSite = (site: DeviceCallSite, scope: Scope): boolean => {
		const [local] = site.calleePath;
		return (
			deviceName(site.calleePath, scope) !== undefined ||
			(local !== undefined && !scope.locals.has(local) && scope.deviceObjects.has(local))
		);
	};
	const importsDevice = (name: string, scope: Scope): boolean =>
		!scope.locals.has(name) && scope.module.imports.get(name)?.source === DEVICE_MODULE;
	const deviceValueCell = (name: NativeDeviceValue): string => {
		const id = `device:${name}`;
		features.add(DEVICE_VALUES[name].feature);
		addCell({ id, name, initial: DEVICE_VALUES[name].initial, device: name });
		return id;
	};
	/** An async computed's value: its task cell's `value`, read only inside the `@try` arm that waits on it. */
	const asyncRead = (
		computed: SemanticGraphArtifact['graphBindings'][number],
		what: string,
		scope: Scope,
	): NativeExpr | null => {
		if (scope.boundary?.arm !== 'try')
			return refuse(`${what} reads the async value \`${computed.name}\` outside a @try`);
		const body = computed.nativeExpression;
		const call = methodCallSite(body?.kind === 'await' ? body.value : body);
		const device = call ? deviceName(call.calleePath, scope) : undefined;
		if (
			!call ||
			device === undefined ||
			!isDeviceCall(device) ||
			!DEVICE_CALLS[device].async
		)
			return refuse(
				`${what} reads the async value \`${computed.name}\`, whose body is not one device call; it needs a script engine`,
			);
		const id = `${scope.prefix}task:${computed.id}`;
		if (!cells.some((cell) => cell.id === id)) {
			const args = call.arguments.map((argument) =>
				exprOf(argument, `the async value \`${computed.name}\``, {
					...scope,
					boundary: undefined,
				}),
			);
			if (!args.every((argument) => argument !== null)) return null;
			features.add(DEVICE_CALLS[device].feature);
			addCell({
				id,
				name: computed.name,
				initial: { state: 'pending' },
				task: { call: device, arguments: args as NativeExpr[] },
			});
		}
		scope.boundary.tasks.add(id);
		return { member: { cell: id }, property: 'value' };
	};
	const objects: { id: string; device: NativeDeviceObject; owner: string }[] = [];
	/** A component instance's device objects (`const cam = camera()`), each one per instance; `own` names their owner node. */
	const instanceObjects = (module: ModuleFacts, component: string, prefix: string) => {
		const made: { id: string; device: NativeDeviceObject; owner: string }[] = [];
		const byName = new Map(
			(module.graph.deviceObjects ?? []).flatMap((fact) => {
				if (fact.componentName !== component || !Object.hasOwn(DEVICE_OBJECTS, fact.device))
					return [];
				const object = {
					id: `object:${prefix}${fact.name}`,
					device: fact.device as NativeDeviceObject,
					owner: '',
				};
				if (!objects.some((known) => known.id === object.id)) {
					objects.push(object);
					made.push(object);
				}
				features.add(DEVICE_OBJECTS[object.device].feature);
				return [[fact.name, object] as const];
			}),
		);
		return {
			byName,
			/** The instance's first node owns its objects: they live while it is shown. */
			own: (firstNode: number) => {
				const owner = nodes[firstNode];
				if (made.length > 0 && !owner)
					refuse(`<${component}> makes a device object and renders nothing`);
				for (const object of made) object.owner = owner?.id ?? '';
			},
		};
	};
	/** A device object's field (`cam.ready`) as its device cell. */
	const objectFieldCell = (
		local: string,
		object: { id: string; device: NativeDeviceObject },
		field: string,
		what: string,
	): string | null => {
		const name = `${object.device}.${field}`;
		if (!isDeviceValue(name) || !('object' in DEVICE_VALUES[name]))
			return refuse(
				`${what} reads \`${local}.${field}\`, which a ${object.device} has no native field for yet`,
			);
		const id = `${object.id}:${field}`;
		addCell({
				id,
				name: `${local}.${field}`,
				initial: DEVICE_VALUES[name].initial,
				device: name,
				object: object.id,
			});
		return id;
	};
	const isDeviceValue = (name: string): name is NativeDeviceValue =>
		Object.hasOwn(DEVICE_VALUES, name);
	const isDeviceCall = (name: string): name is NativeDeviceCall =>
		Object.hasOwn(DEVICE_CALLS, name);
	const scriptMode = options.scriptHandlers ?? 'fallback';
	/** Script functions by where they are written; each payload numbers its own. */
	const scriptFunctions = new Map<string, { readonly id: string; readonly module: ModuleFacts; readonly fact: SemanticScriptFunction }>();
	const scriptServices = new Set<NativeScriptService>();
	const refuseScript = (message: string, span?: SourceSpan): null => {
		diagnostics.push(nativeScriptRefusal(message, span));
		return null;
	};

	/** Whether every global a script reads is one a phone's engine has; refuses each other one by name, file and line. */
	function checkGlobals(globals: ReadonlyArray<SemanticScriptGlobal>, what: string): boolean {
		let ok = true;
		for (const global of globals) {
			if (global.typeofOnly) continue;
			const name = GLOBAL_OBJECTS.has(global.name) && global.property !== undefined ? global.property : global.name;
			if (GLOBAL_OBJECTS.has(name) && name === 'globalThis' && global.property === undefined) continue;
			if (LANGUAGE_GLOBALS.has(name)) continue;
			const service = Object.hasOwn(NATIVE_SCRIPT_HOST_GLOBALS, name) ? NATIVE_SCRIPT_HOST_GLOBALS[name] : undefined;
			if (service) {
				if (service !== 'engine') scriptServices.add(service);
				continue;
			}
			ok = false;
			const page = Object.hasOwn(NATIVE_SCRIPT_PAGE_GLOBALS, name) ? NATIVE_SCRIPT_PAGE_GLOBALS[name] : undefined;
			const spelled = name === global.name ? name : `${global.name}.${name}`;
			refuseScript(
				page
					? `${what} uses \`${spelled}\`: ${page}`
					: `${what} uses \`${spelled}\`, which a phone's script engine does not provide`,
				global.span,
			);
		}
		return ok;
	}

	/** The payload's id of a script function, registered once; null when it uses what no phone script has. */
	function scriptFunctionId(fact: SemanticScriptFunction, module: ModuleFacts, what: string): string | null {
		const key = `${fact.span.filename}\0${fact.span.start}`;
		const known = scriptFunctions.get(key);
		if (known) return known.id;
		let ok = checkGlobals(fact.globals, what);
		for (const use of fact.framework) {
			ok = false;
			refuseScript(`${what} calls \`${use.name}\` from ${use.source} inside JavaScript that runs on the phone, which it cannot reach there yet`, use.span);
		}
		for (const construct of fact.unsupported) {
			ok = false;
			refuseScript(`${what} uses ${construct.construct}, which a phone's script cannot run`, construct.span);
		}
		if (!ok) return null;
		const id = `fn:${scriptFunctions.size}`;
		scriptFunctions.set(key, { id, module, fact });
		return id;
	}

	/** What each name a script function reads from its component means there: a cell, a state object's cells, or a value. */
	function scriptBindings(
		fact: SemanticScriptFunction,
		scope: Scope,
		what: string,
	): Record<string, NativeScriptBinding> | null {
		const bindings: Record<string, NativeScriptBinding> = {};
		let ok = true;
		for (const { name, written, span } of fact.names) {
			const object = scope.objects.get(name);
			if (object?.kind === 'fields') {
				bindings[name] = { fields: Object.fromEntries(object.cells) };
				continue;
			}
			if (object?.kind === 'instance' || scope.deviceObjects.has(name)) {
				ok = false;
				refuseScript(`${what} uses \`${name}\` (${object ? 'a shared() object' : 'a device object'}), which JavaScript on a phone cannot reach yet`, span);
				continue;
			}
			const read = attempt(() => exprOf({ kind: 'read', name }, `${what}'s \`${name}\``, scope));
			if (read.value && 'cell' in read.value && !read.failed) {
				bindings[name] = { cell: read.value.cell };
				continue;
			}
			if (written) {
				read.rollBack();
				ok = false;
				refuseScript(`${what} assigns \`${name}\`, which is not state`, span);
				continue;
			}
			if (read.failed || !read.value) {
				const added = read.value === null || read.failed;
				read.rollBack();
				if (added) {
					ok = false;
					refuseScript(`${what} reads \`${name}\`, which JavaScript on a phone cannot reach (not state, a prop value, a row item or a computed)`, span);
				}
				continue;
			}
			if (mentionsElement(read.value)) {
				read.rollBack();
				ok = false;
				refuseScript(`${what} uses the element \`${name}\`, which JavaScript on a phone cannot reach yet`, span);
				continue;
			}
			bindings[name] = { value: read.value };
		}
		return ok ? bindings : null;
	}

	/** A computed whose body is not data, as a call into the script; null with a refusal when no script runs it either. */
	function scriptComputed(
		computed: SemanticGraphArtifact['graphBindings'][number],
		scope: Scope,
		what: string,
	): NativeExpr | null {
		const fact = computed.nativeScript;
		if (!fact || scriptMode === 'never')
			return refuse(`${what} reads the computed \`${computed.name}\`, whose body needs a script engine`);
		const label = `the computed \`${computed.name}\``;
		const fn = scriptFunctionId(fact, scope.module, label);
		const bindings = scriptBindings(fact, scope, label);
		return fn === null || bindings === null ? null : { script: fn, bindings };
	}

	/**
	 * The payload's script: the statements its functions reach, module by module, through the analyzer's references, each
	 * module's effects, and the exports something reads. A module the build was not given is asked for (`missingModules`);
	 * one it cannot read is refused by name.
	 */
	function buildScript(): NativeViewPayload['script'] | undefined {
		if (scriptFunctions.size === 0) return undefined;
		type Included = {
			readonly module: ModuleFacts;
			readonly index: number;
			readonly statements: Set<number>;
			readonly exports: Map<string, string>;
			readonly slots: Map<number, number | null>;
		};
		const included = new Map<ModuleFacts, Included>();
		const order: Included[] = [];
		const where = (module: ModuleFacts) => module.graph.filename;
		const factsOf = (module: ModuleFacts) => module.graph.scriptModule;
		const enter = (module: ModuleFacts): Included | undefined => {
			const known = included.get(module);
			if (known) return known;
			const facts = factsOf(module);
			if (!facts) {
				refuseScript(`${where(module)} has no script facts; it was not analyzed for a native build`);
				return undefined;
			}
			const entry: Included = { module, index: order.length, statements: new Set(), exports: new Map(), slots: new Map() };
			included.set(module, entry);
			order.push(entry);
			if (facts.commonjs) refuseScript(`${where(module)} is a CommonJS module, which a phone's script does not load; use its ES module build`);
			facts.statements.forEach((statement, index) => {
				if (statement.effect) include(entry, index);
			});
			return entry;
		};
		const target = (entry: Included, slot: number): Included | undefined => {
			if (entry.slots.has(slot)) {
				const known = entry.slots.get(slot);
				return known === null || known === undefined ? undefined : order[known];
			}
			const { specifier, span } = factsOf(entry.module)!.imports[slot]!;
			const module = moduleAt(entry.module, specifier);
			if (!module && missingModules.size === 0)
				refuseScript(`${where(entry.module)} imports \`${specifier}\`, which the build could not read for the phone's script`, span);
			const reached = module && enter(module);
			entry.slots.set(slot, reached ? reached.index : null);
			return reached;
		};
		const include = (entry: Included, index: number): void => {
			if (entry.statements.has(index)) return;
			entry.statements.add(index);
			const statement = factsOf(entry.module)!.statements[index]!;
			const at = where(entry.module);
			// A CommonJS module is refused as a whole; its `require` and `exports` say nothing more.
			if (factsOf(entry.module)!.commonjs) return;
			for (const use of statement.dropped)
				refuseScript(`${at} uses \`${use.name}\` (a component or framework state) outside a component, which a phone's script cannot run`, use.span);
			for (const use of statement.framework)
				refuseScript(`${at} uses \`${use.name}\` from ${use.source} outside a component, which a phone's script cannot run`, use.span);
			for (const construct of statement.unsupported)
				refuseScript(`${at} uses ${construct.construct}, which a phone's script cannot run`, construct.span);
			checkGlobals(statement.globals, at);
			for (const name of statement.uses) local(entry, name);
			for (const use of statement.imports) imported(entry, use.slot, use.name);
		};
		const local = (entry: Included, name: string): void =>
			factsOf(entry.module)!.statements.forEach((statement, index) => {
				if (statement.declares.includes(name)) include(entry, index);
			});
		const imported = (entry: Included, slot: number, name: string | null): void => {
			const reached = target(entry, slot);
			if (!reached) return;
			if (name === null) everything(reached);
			else exported(reached, name);
		};
		/** Whether a module exports `name`, itself or through `export *`. */
		const exports = (module: ModuleFacts, name: string, seen = new Set<ModuleFacts>()): boolean => {
			if (seen.has(module)) return false;
			seen.add(module);
			const facts = factsOf(module);
			if (!facts) return false;
			return facts.exports.some((entry) => {
				if ('star' in entry) {
					const next = moduleAt(module, facts.imports[entry.star]!.specifier);
					return name !== 'default' && !!next && exports(next, name, seen);
				}
				return entry.name === name;
			});
		};
		const exported = (entry: Included, name: string): void => {
			if (entry.exports.has(name)) return;
			const facts = factsOf(entry.module)!;
			const direct = facts.exports.find((candidate) => !('star' in candidate) && candidate.name === name);
			if (direct && 'local' in direct) {
				entry.exports.set(name, direct.local);
				local(entry, direct.local);
				return;
			}
			if (direct && 'slot' in direct) {
				entry.exports.set(name, `__i[${direct.slot}]${direct.from === null ? '' : `[${JSON.stringify(direct.from)}]`}`);
				imported(entry, direct.slot, direct.from);
				return;
			}
			for (const candidate of facts.exports) {
				if (!('star' in candidate) || name === 'default') continue;
				const next = moduleAt(entry.module, facts.imports[candidate.star]!.specifier);
				if (!next || !exports(next, name)) continue;
				entry.exports.set(name, `__i[${candidate.star}][${JSON.stringify(name)}]`);
				imported(entry, candidate.star, name);
				return;
			}
		};
		const everything = (entry: Included): void => {
			const facts = factsOf(entry.module)!;
			for (const candidate of facts.exports) {
				if ('star' in candidate) {
					const reached = target(entry, candidate.star);
					if (reached) everything(reached);
					entry.exports.set(`*${candidate.star}`, `__i[${candidate.star}]`);
				} else exported(entry, candidate.name);
			}
		};
		for (const { module, fact, id } of scriptFunctions.values()) {
			const entry = enter(module);
			if (!entry) continue;
			for (const name of fact.module) local(entry, name);
			for (const use of fact.imports) imported(entry, use.slot, use.name);
			void id;
		}
		const inputs: NativeScriptModuleInput[] = order.map((entry) => {
			const facts = factsOf(entry.module)!;
			const getters = [...entry.exports].filter(([name]) => !name.startsWith('*'));
			const stars = [...entry.exports].filter(([name]) => name.startsWith('*')).map(([, value]) => value);
			return {
				code: [
					...(getters.length > 0
						? [`__export(exports, {\n${getters.map(([name, value]) => `${JSON.stringify(name)}: function () { return ${value}; }`).join(',\n')}\n});`]
						: []),
					...stars.map((value) => `__exportStar(exports, ${value});`),
					...facts.statements.flatMap((statement, index) => (entry.statements.has(index) ? [statement.code] : [])),
				].join('\n'),
				imports: facts.imports.map((_, slot) => entry.slots.get(slot) ?? null),
				functions: [...scriptFunctions.values()]
					.filter((fn) => fn.module === entry.module)
					.map((fn) => ({ id: fn.id, code: fn.fact.code })),
			};
		});
		return nativeScriptOf(inputs, [...scriptServices].sort());
	}

	const inlining = new Set<string>();
	/** `scope` where `name` reads `value`, hiding any outer meaning of that name. */
	const bindName = (scope: Scope, name: string, value: NativeExpr): Scope => {
		const objects = new Map(scope.objects);
		objects.delete(name);
		return {
			...scope,
			args: new Map(scope.args).set(name, value),
			locals: new Set([...scope.locals].filter((local) => local !== name)),
			objects,
			...(scope.event === name ? { event: undefined } : {}),
		};
	};
	/** Set while handlers are lowered, after the whole tree: only then does every handle know the elements it is bound to. */
	let lateLowering = false;
	/** Whether the handler being lowered read the element a tap landed on. */
	let pressedTargetRead = false;
	const nodeById = () => new Map(nodes.map((node) => [node.id, node]));

	/** A handle read as a value in a handler: its element (null when unbound), or its elements in order when plural. */
	const handleValue = (key: string, plural: boolean, what: string): NativeExpr | null => {
		if (!lateLowering) return refuse(`${what} as a value outside a handler`);
		const bound = boundHandles.get(key) ?? [];
		const byId = nodeById();
		if (bound.some((id) => byId.get(id)?.row))
			return refuse(`${what}, a handle bound inside a @for row`);
		if (plural) return { array: bound.map((id) => ({ spread: false, value: elementValue(id) })) };
		if (bound.length > 1) return refuse(`${what}, a handle bound to more than one element`);
		return bound[0] ? elementValue(bound[0]) : { literal: null };
	};

	/** Whether `inner` is `outer` or inside it. */
	const isWithin = (inner: string, outer: string): boolean => {
		const byId = nodeById();
		for (let at: string | null | undefined = inner; at; at = byId.get(at)?.parent) if (at === outer) return true;
		return false;
	};

	/** An element's attribute as the web writes it (null when absent), from what it was built with or a binding. */
	const attributeOf = (element: string, name: string): NativeExpr => {
		const node = nodeById().get(element);
		if (node?.kind !== 'element') return { literal: null };
		const binding = node.bindings?.find((one) => 'attribute' in one && one.attribute === name);
		if (!binding) return { literal: node.attributes?.[name] ?? null };
		const value = binding.value;
		const known = buildTime(value);
		if (known && (isScalar(known.value) || known.value === undefined)) return { literal: marklessAttributeValue(name, known.value) };
		const spelled = (flag: boolean): NativeExpr => ({ literal: marklessAttributeValue(name, flag) });
		return {
			if: { binary: '===', left: value, right: { literal: null } },
			whenTrue: { literal: null },
			whenFalse: {
				if: { binary: '===', left: value, right: { literal: true } },
				whenTrue: spelled(true),
				whenFalse: {
					if: { binary: '===', left: value, right: { literal: false } },
					whenTrue: spelled(false),
					whenFalse: { call: 'String', arguments: [value] },
				},
			},
		};
	};

	/** `contains`, `getAttribute` and `hasAttribute` on an element known when the app is built. */
	const elementMethod = (
		element: string,
		method: string,
		args: ReadonlyArray<SemanticExpression>,
		what: string,
		scope: Scope,
	): NativeExpr | null => {
		const [first, ...more] = args;
		if (method === 'contains' && first && more.length === 0) {
			const other = exprOf(first, what, scope);
			if (!other) return null;
			const inner = elementOf(other);
			if (inner !== undefined) return { literal: isWithin(inner, element) };
			if ('literal' in other && other.literal === null) return { literal: false };
			return refuse(`${what} asks whether an element contains something other than an element`);
		}
		if ((method === 'getAttribute' || method === 'hasAttribute') && first?.kind === 'literal' && typeof first.value === 'string' && more.length === 0) {
			const value = attributeOf(element, first.value);
			return method === 'getAttribute' ? value : { binary: '!==', left: value, right: { literal: null } };
		}
		return refuse(`${what} calls \`.${method}()\` on an element, which has no native meaning yet`);
	};

	/** Whether `expr` is known when the app is built (no cell, row item or event read), and what it is then. */
	const buildTime = (expr: NativeExpr): { readonly value: unknown } | undefined =>
		cellsOf(expr).size === 0 ? foldConstant(expr, () => undefined) : undefined;

	/**
	 * A module function's return value where it is called: each statement runs with the values of its locals so far, an
	 * `if` whose test is known when the app is built takes its branch (else both, joined by a conditional), and a loop over
	 * a list known then runs its body once per item. `loops` holds the passes still to run of the loops being run.
	 */
	function evaluateFunction(
		statements: ReadonlyArray<SemanticFunctionStatement>,
		what: string,
		scope: Scope,
		locals: ReadonlySet<string>,
		loops: ReadonlyArray<LoopPass> = [],
		end: NativeExpr = { literal: null },
	): NativeExpr | null {
		const [first, ...rest] = statements;
		if (!first) {
			const [loop, ...outer] = loops;
			if (!loop) return end;
			return runLoop(loop, what, scope, locals, outer, end);
		}
		const next = (inner: Scope, names = locals) => evaluateFunction(rest, what, inner, names, loops, end);
		switch (first.kind) {
			case 'unsupported':
				return refuse(`${what} uses ${first.construct}, which needs a script engine`);
			case 'return':
				return exprOf(first.value, what, scope);
			case 'let':
			case 'set': {
				if (first.kind === 'set' && !locals.has(first.name))
					return refuse(`${what} writes \`${first.name}\`, which is not one of its own names`);
				const value = exprOf(first.value, what, scope);
				return value && next(bindName(scope, first.name, value), new Set([...locals, first.name]));
			}
			case 'push': {
				const list = locals.has(first.name) ? scope.args.get(first.name) : undefined;
				if (!list) return refuse(`${what} pushes onto \`${first.name}\`, which is not one of its own names`);
				const value = exprOf(first.value, what, scope);
				if (!value) return null;
				const grown: NativeExpr =
					'array' in list
						? { array: [...list.array, { spread: false, value }] }
						: { array: [{ spread: true, value: list }, { spread: false, value }] };
				return next(bindName(scope, first.name, grown));
			}
			case 'if': {
				const test = exprOf(first.test, `${what}'s \`if\` test`, scope);
				if (!test) return null;
				const known = buildTime(test);
				if (known)
					return evaluateFunction([...(known.value ? first.whenTrue : first.whenFalse), ...rest], what, scope, locals, loops, end);
				const whenTrue = evaluateFunction([...first.whenTrue, ...rest], what, scope, locals, loops, end);
				const whenFalse = evaluateFunction([...first.whenFalse, ...rest], what, scope, locals, loops, end);
				return whenTrue && whenFalse && { if: test, whenTrue, whenFalse };
			}
			case 'each': {
				const list = exprOf(first.list, what, scope);
				if (!list) return null;
				const known = buildTime(list);
				if (!known || !Array.isArray(known.value))
					return refuse(`${what} loops over a list known only while the app runs`);
				const loop: LoopPass = { items: known.value, name: first.name, body: first.body, after: rest };
				return runLoop(loop, what, scope, locals, loops, end);
			}
			case 'count': {
				// Over a list known only while the app runs: a body that only returns one value is `some` over the indices.
				const over = exprOf(first.over, what, scope);
				if (!over) return null;
				const index: NativeExpr = { local: first.name };
				const passes = evaluateFunction(first.body, what, bindName(scope, first.name, index), new Set(), [], NEXT_PASS);
				if (!passes) return null;
				const returned = new Set<string>();
				const exits = (tree: NativeExpr): NativeExpr => {
					if (tree === NEXT_PASS) return { literal: false };
					if ('if' in tree && tree !== NEXT_PASS) return { if: tree.if, whenTrue: exits(tree.whenTrue), whenFalse: exits(tree.whenFalse) };
					returned.add(JSON.stringify(tree));
					return { literal: true };
				};
				const test = exits(passes);
				const after = next(scope);
				if (returned.size === 0 || !after) return after;
				const [value] = [...returned];
				if (returned.size > 1 || value!.includes(JSON.stringify(index)))
					return refuse(`${what} returns from a loop over indices a value that depends on where it stopped`);
				return {
					if: { method: 'some', target: over, arguments: [{ lambda: [`${first.name}:item`, first.name], body: test }] },
					whenTrue: JSON.parse(value!) as NativeExpr,
					whenFalse: after,
				};
			}
		}
	}

	/** The next pass of a loop (its name bound to the next item), or what follows the loop once no item is left. */
	function runLoop(
		loop: LoopPass,
		what: string,
		scope: Scope,
		locals: ReadonlySet<string>,
		outer: ReadonlyArray<LoopPass>,
		end: NativeExpr,
	): NativeExpr | null {
		const [item, ...more] = loop.items;
		if (loop.items.length === 0) return evaluateFunction(loop.after, what, scope, locals, outer, end);
		const value = expressionOfValue(item);
		if (!value) return refuse(`${what} loops over a list whose items are not JSON or elements`);
		return evaluateFunction(
			loop.body,
			what,
			bindName(scope, loop.name, value),
			new Set([...locals, loop.name]),
			[{ ...loop, items: more }, ...outer],
			end,
		);
	}

	/** Where a module-level function's body is lowered: only its parameters (bound by the caller) and other functions. */
	const helperScope = (module: ModuleFacts, caller: Scope): Scope => ({
		module,
		component: '',
		cells: { byName: new Map(), byBinding: new Map() },
		prefix: caller.prefix,
		locals: new Set(),
		items: new Map(),
		props: new Map(),
		objects: new Map(),
		args: new Map(),
		shared: new Map(),
		deviceObjects: new Map(),
	});
	function exprOf(
		expression: SemanticExpression | undefined,
		what: string,
		scope: Scope,
	): NativeExpr | null {
		if (!expression) return refuse(`${what} has no expression the compiler recorded`);
		const all = (list: ReadonlyArray<SemanticExpression>): NativeExpr[] | null => {
			const lowered = list.map((item) => exprOf(item, what, scope));
			return lowered.every((item) => item !== null) ? (lowered as NativeExpr[]) : null;
		};
		switch (expression.kind) {
			case 'read': {
				if (scope.locals.has(expression.name)) return { local: expression.name };
				const bound = scope.args.get(expression.name);
				if (bound) return bound;
				if (scope.opaque === expression.name) return refuse(`${what} reads its event`);
				if (scope.deviceObjects.has(expression.name))
					return refuse(
						`${what} reads the device object \`${expression.name}\` as a value; read one of its fields`,
					);
				if (
					scope.boundary?.arm === 'catch' &&
					expression.name === scope.boundary.errorName
				) {
					const [task] = scope.boundary.tasks;
					const handlerError = scope.boundary.catches.used()
						? scope.boundary.catches.cell()
						: undefined;
					const taskError: NativeExpr | undefined = task
						? { member: { cell: task }, property: 'error' }
						: undefined;
					if (handlerError && taskError)
						return {
							if: {
								binary: '!==',
								left: { cell: handlerError },
								right: { literal: null },
							},
							whenTrue: { cell: handlerError },
							whenFalse: taskError,
						};
					return handlerError
						? { cell: handlerError }
						: (taskError ??
								refuse(
									`${what} reads the @catch error of a @try that reads no device value`,
								));
				}
				if (importsDevice(expression.name, scope))
					return refuse(
						`${what} reads \`${expression.name}\` from ${DEVICE_MODULE} as a value; read one of its fields`,
					);
				const repeat = scope.items.get(expression.name);
				if (repeat) return { item: repeat };
				const prop = propOf(expression.name, scope);
				if (prop?.kind === 'value') return prop.expr;
				if (prop)
					return refuse(`${what} reads the callback \`${expression.name}\` as a value`);
				if (isPropName(expression.name, scope)) {
					const fallback = scope.module.componentFacts.get(scope.component)?.native
						?.propDefaults[expression.name];
					return fallback ? exprOf(fallback, what, scope) : { literal: null };
				}
				const computed =
					scope.module.computeds.get(scope.component)?.get(expression.name) ??
					scope.module.computeds.get('')?.get(expression.name);
				if (computed?.kind === 'computed' && computed.async)
					return asyncRead(computed, what, scope);
				if (computed) {
					if (inlining.has(computed.id))
						return refuse(
							`${what} reads the computed \`${expression.name}\` inside itself`,
						);
					inlining.add(computed.id);
					try {
						if (!computed.nativeExpression) return scriptComputed(computed, scope, what);
						const data = attempt(() =>
							exprOf(computed.nativeExpression, `the computed \`${expression.name}\``, scope),
						);
						if (!data.failed || scriptMode === 'never' || !computed.nativeScript) return data.value;
						data.rollBack();
						return scriptComputed(computed, scope, what);
					} finally {
						inlining.delete(computed.id);
					}
				}
				const cell = cellOf(expression.name, scope);
				if (cell) return { cell };
				const ownHandle = scope.module.elementBindings.get(`${scope.component}#${expression.name}`);
				if (ownHandle) {
					const binding = scope.module.bindingsById.get(ownHandle);
					return handleValue(`${scope.prefix}${ownHandle}`, binding?.plural === true, `${what} reads \`${expression.name}\``);
				}
				if (scope.objects.has(expression.name))
					return refuse(
						`${what} reads \`${expression.name}\` whole; a native build reads its fields`,
					);
				return refuse(
					`${what} reads \`${expression.name}\`, which is not state of this component`,
				);
			}
			case 'literal':
				return { literal: expression.value };
			case 'unary': {
				if (expression.operator === 'typeof')
					return refuse(
						`${what} uses \`typeof\` other than compared with 'string', 'number' or 'boolean'; a native value does not tell undefined from null`,
					);
				const value = exprOf(expression.value, what, scope);
				return value && { unary: expression.operator, value };
			}
			case 'binary':
			case 'logical': {
				const typeTest = expression.kind === 'binary' ? typeTestOf(expression) : undefined;
				if (typeTest) {
					const value = exprOf(typeTest.value, what, scope);
					return value && {
						binary: expression.operator as '===' | '!==',
						left: { unary: 'typeof', value },
						right: { literal: typeTest.type },
					};
				}
				const left = exprOf(expression.left, what, scope);
				const right = exprOf(expression.right, what, scope);
				if (!left || !right) return null;
				return expression.kind === 'binary'
					? { binary: expression.operator, left, right }
					: { logical: expression.operator, left, right };
			}
			case 'conditional': {
				const test = exprOf(expression.test, what, scope);
				const whenTrue = exprOf(expression.consequent, what, scope);
				const whenFalse = exprOf(expression.alternate, what, scope);
				return test && whenTrue && whenFalse ? { if: test, whenTrue, whenFalse } : null;
			}
			case 'template': {
				const parts = expression.parts.map((part) =>
					typeof part === 'string' ? part : exprOf(part, what, scope),
				);
				return parts.every((part) => part !== null)
					? { template: parts as (string | NativeExpr)[] }
					: null;
			}
			case 'member': {
				const holder = expression.object;
				if (
					holder.kind === 'read' &&
					scope.objects.has(holder.name) &&
					!scope.locals.has(holder.name)
				) {
					const object = scope.objects.get(holder.name)!;
					if (object.kind === 'fields') {
						const cell = object.cells.get(expression.property);
						return cell
							? { cell }
							: refuse(
									`${what} reads \`${holder.name}.${expression.property}\`, which is not one of its fields`,
								);
					}
					const field = object.instance.fields.get(expression.property);
					if (field?.kind === 'cell') return { cell: field.cell };
					if (field?.kind === 'expr')
						return exprOf(
							field.expression,
							`${object.instance.definition.name}.${expression.property}`,
							object.instance.scope,
						);
					if (field?.kind === 'handle')
						return handleValue(field.key, field.plural, `${what} reads \`${holder.name}.${expression.property}\``);
					return refuse(
						`${what} reads \`${holder.name}.${expression.property}\` as a value`,
					);
				}
				if (holder.kind === 'read' && holder.name === scope.opaque && !scope.args.has(holder.name)) {
					if (TOUCH_MODIFIERS.has(expression.property)) return { literal: false };
					if (scope.pressed && (expression.property === 'target' || expression.property === 'currentTarget')) {
						if (expression.property === 'target') pressedTargetRead = true;
						return elementValue(scope.pressed[expression.property]);
					}
					return refuse(`${what} reads \`${holder.name}.${expression.property}\`, which a tap on a phone does not have`);
				}
				if (
					scope.event !== undefined &&
					expression.property === 'value' &&
					holder.kind === 'member' &&
					(holder.property === 'currentTarget' || holder.property === 'target') &&
					holder.object.kind === 'read' &&
					holder.object.name === scope.event
				)
					return { event: 'value' };
				if (
					holder.kind === 'read' &&
					!scope.locals.has(holder.name) &&
					scope.deviceObjects.has(holder.name)
				) {
					const cell = objectFieldCell(
						holder.name,
						scope.deviceObjects.get(holder.name)!,
						expression.property,
						what,
					);
					return cell === null ? null : { cell };
				}
				if (holder.kind === 'read') {
					const device = deviceName([holder.name, expression.property], scope);
					if (
						device !== undefined &&
						holder.name !== undefined &&
						scope.module.imports.get(holder.name)?.importedName === 'platform'
					)
						return refuse(
							`${what} reads \`${device}\`, which is decided per phone; build the payload with a target`,
						);
					if (device !== undefined)
						return isDeviceValue(device)
							? { cell: deviceValueCell(device) }
							: refuse(
									`${what} reads \`${device}\`, which ${DEVICE_MODULE} has no native value for yet`,
								);
				}
				const object = exprOf(expression.object, what, scope);
				return object && { member: object, property: expression.property };
			}
			case 'call': {
				if (!BUILTINS.has(expression.callee))
					return refuse(
						`${what} uses a call to \`${expression.callee}\`, which needs a script engine`,
					);
				const args = all(expression.arguments);
				return args && { call: expression.callee as NativeBuiltin, arguments: args };
			}
			case 'await':
				return refuse(`${what} uses \`await\`, which needs a script engine`);
			case 'index': {
				const of = exprOf(expression.object, what, scope);
				const at = exprOf(expression.index, what, scope);
				return of && at && { at, of };
			}
			case 'apply': {
				const name = expression.callee;
				if (
					scope.locals.has(name) ||
					scope.args.has(name) ||
					scope.items.has(name) ||
					scope.objects.has(name) ||
					isPropName(name, scope) ||
					cellOf(name, scope)
				)
					return refuse(`${what} calls \`${name}\`, a value the build cannot call`);
				const found = functionAt(scope.module, name);
				if (!found) return refuse(`${what} uses a call to \`${name}\`, which needs a script engine`);
				const key = `${found.module.graph.filename}#${found.fn.name}`;
				if (inlining.has(key)) return refuse(`${what} calls \`${name}\` inside itself`);
				const args = all(expression.arguments);
				if (!args) return null;
				const { parameters, statements } = found.fn.native;
				const inner = parameters.reduce<Scope>(
					(bound, parameter, index) => bindName(bound, parameter, args[index] ?? { literal: null }),
					helperScope(found.module, scope),
				);
				inlining.add(key);
				try {
					return evaluateFunction(statements, `the function \`${found.fn.name}\``, inner, new Set(parameters));
				} finally {
					inlining.delete(key);
				}
			}
			case 'array': {
				const items = expression.items.map((item) => {
					const value = exprOf(item.value, what, scope);
					return value && { spread: item.spread, value };
				});
				return items.every((item) => item !== null)
					? { array: items as { spread: boolean; value: NativeExpr }[] }
					: null;
			}
			case 'object': {
				const entries = expression.entries.map(([key, value]) => {
					const lowered = exprOf(value, what, scope);
					return lowered && ([key, lowered] as const);
				});
				return entries.every((entry) => entry !== null)
					? { object: entries as (readonly [string, NativeExpr])[] }
					: null;
			}
			case 'method': {
				if (!METHODS.has(expression.method)) {
					const site = methodCallSite(expression);
					if (site && isDeviceCallSite(site, scope))
						return refuse(
							`${what} calls \`${site.callee}\` inside an expression; call it as a handler statement or as an async computed's body`,
						);
					const mark = diagnostics.length;
					const holder = exprOf(expression.object, what, scope);
					const element = elementOf(holder);
					if (element === undefined) {
						diagnostics.length = mark;
						return refuse(`${what} uses a call to \`${calleeText(expression.object)}.${expression.method}\`, which needs a script engine`);
					}
					return elementMethod(element, expression.method, expression.arguments, what, scope);
				}
				if (expression.method === 'reverse' && expression.object.kind !== 'array')
					return refuse(
						`${what} reverses an array in place; reverse a copy (\`[...list].reverse()\`)`,
					);
				const target = exprOf(expression.object, what, scope);
				const args = expression.arguments.map((argument) => {
					if (argument.kind !== 'lambda') return exprOf(argument, what, scope);
					const inner: Scope = {
						...scope,
						locals: new Set([...scope.locals, ...argument.parameters]),
					};
					const lambdaBody = exprOf(argument.body, what, inner);
					return lambdaBody && { lambda: argument.parameters, body: lambdaBody };
				});
				return target && args.every((argument) => argument !== null)
					? {
							method: expression.method as NativeMethod,
							target,
							arguments: args as NativeExpr[],
						}
					: null;
			}
			case 'let': {
				const value = exprOf(expression.value, what, scope);
				return value && exprOf(expression.body, what, bindName(scope, expression.name, value));
			}
			case 'lambda':
				return refuse(`${what} uses a function value outside a method call`);
			case 'unsupported':
				return refuse(`${what} uses ${expression.construct}, which needs a script engine`);
		}
	}

	/** Attributes whose value is an element handle, by host: lowered to the bound elements' node ids once all are known. */
	const handleAttributes = (chunk: SemanticMarkupChunk, path: ReadonlyArray<number>) =>
		chunk.slots.flatMap((slot) =>
			slot.kind === 'attribute' &&
			comparePaths(slot.coordinate.path, path) === 0 &&
			(slot.residue.kind === 'element-handle-id' ||
				slot.residue.kind === 'element-handle-id-list')
				? [
						{
							name: slot.name,
							handles:
								slot.residue.kind === 'element-handle-id'
									? [slot.residue.handleGraphNodeId]
									: slot.residue.handleGraphNodeIds,
						},
					]
				: [],
		);
	/** Where a handle graph node lives in this build: the shared instance (or component instance) the scope resolved. */
	const handleKey = (graphNodeId: string, scope: Scope): string | undefined => {
		const binding = scope.module.bindingsById.get(graphNodeId);
		if (binding?.sharedDefinitionId) {
			for (const object of scope.objects.values()) {
				const instance = object.kind === 'instance' ? object.instance : object.instance;
				if (instance?.definition.id === binding.sharedDefinitionId)
					return `${instance.prefix}${graphNodeId}`;
			}
			return undefined;
		}
		return binding ? `${scope.prefix}${graphNodeId}` : undefined;
	};
	const boundHandles = new Map<string, string[]>();
	const dialogOps: { op: 'dialog'; node: string; method: 'showModal' | 'close' }[] = [];
	const handleReferences: {
		readonly node: string;
		readonly attribute: string;
		readonly keys: ReadonlyArray<string | undefined>;
	}[] = [];

	const bindingsOf = (host: string, scope: Scope, skip: ReadonlySet<string>): ElementBindings =>
		(scope.module.readsByHost.get(host) ?? []).flatMap((read): ElementBindings => {
			const target = read.target;
			if (target.kind === 'text') return [];
			if (target.kind === 'attribute' && skip.has(target.name)) return [];
			// A button's `value` is the form value its `value` attribute reflects; only a text field shows one.
			if (target.kind === 'property' && target.name === 'value' && !TEXT_ENTRY.has(scope.module.tagOf.get(host) ?? '')) {
				const value = exprOf(read.expression, 'the `value` attribute', scope);
				return value ? [{ attribute: 'value', value }] : [];
			}
			if (target.kind === 'property' && target.name === 'value') {
				const value = exprOf(read.expression, 'the `value` property', scope);
				return value ? [{ property: 'value' as const, value }] : [];
			}
			if (target.kind === 'attribute') {
				const value = exprOf(read.expression, `the \`${target.name}\` attribute`, scope);
				return value ? [{ attribute: target.name, value }] : [];
			}
			if (
				target.kind === 'class' &&
				target.trueValue !== undefined &&
				target.falseValue !== undefined &&
				target.constantClass === undefined &&
				target.leadingClass === undefined
			) {
				const test = exprOf(read.expression, 'the class test', scope);
				return test
					? [
							{
								attribute: 'class',
								value: {
									if: test,
									whenTrue: { literal: target.trueValue },
									whenFalse: { literal: target.falseValue },
								},
							},
						]
					: [];
			}
			refuse(`a ${target.kind} binding${'name' in target ? ` (\`${target.name}\`)` : ''}`);
			return [];
		});
	const textPartOf = (graphNodeId: string, scope: Scope): NativeTextPart | null => {
		const cell = scope.cells.byBinding.get(graphNodeId);
		if (cell) return { cell };
		const read = scope.module.computedReads.get(graphNodeId);
		const expr = read
			? exprOf(read.expression, 'a text expression', scope)
			: refuse('a text binding that is not state');
		return expr && { expr };
	};

	const nodes: NativeNode[] = [];
	/** Each list's row key as an expression of its row item: how a row's instance ids are spelt (`<node>@<key>`). */
	const rowKeys = new Map<string, NativeExpr>();
	const textRuns = new Map<string, number>();
	const lowered = new Set<string>();

	const events: NativeViewPayload['events'][number][] = [];
	const handlers: { readonly id: string; ops: NativeOp[] }[] = [];
	const pendingHandlers: {
		readonly handler: { readonly id: string; ops: NativeOp[] };
		readonly event: SemanticEvent;
		readonly scope: Scope;
		readonly host: string;
	}[] = [];
	const loweredEvents = new Set<string>();
	const lowerChunk = (
		chunk: SemanticMarkupChunk,
		baseParent: string | null,
		place: NativePlace,
		scope: Scope,
	) => {
		if (scope.module === rootModule) lowered.add(chunk.id);
		const items: Item[] = [
			...chunk.hosts.map((host): Item => ({
				kind: 'host',
				id: host.hostNodeId,
				path: host.coordinate.path,
			})),
			...(chunk.texts ?? []).map((text): Item => ({
				kind: 'part',
				part: { text: text.text },
				path: text.coordinate.path,
			})),
		];
		for (const slot of chunk.slots) {
			if (slot.kind === 'attribute' || slot.kind === 'spread-attributes') continue;
			if (slot.kind === 'child-component') {
				items.push({
					kind: 'child',
					edge: slot.componentEdgeId,
					template: slot.childTemplateId,
					...(slot.projectionChunkId ? { projection: slot.projectionChunkId } : {}),
					path: slot.coordinate.path,
				});
				continue;
			}
			if (slot.kind === 'repeat') {
				items.push({
					kind: 'repeat',
					id: slot.repeatId,
					row: slot.rowTemplateId,
					...(slot.emptyTemplateId ? { empty: slot.emptyTemplateId } : {}),
					path: slot.coordinate.path,
				});
				continue;
			}
			if (slot.kind === 'branch') {
				items.push({
					kind: 'branch',
					id: slot.branchSiteId,
					arms: slot.armTemplateIds,
					path: slot.coordinate.path,
				});
				continue;
			}
			if (slot.kind === 'async') {
				items.push({
					kind: 'boundary',
					id: slot.boundaryId,
					arms: slot.armTemplateIds,
					path: slot.coordinate.path,
				});
				continue;
			}
			if (slot.kind !== 'text') {
				refuse(`a ${slot.kind} binding`);
				continue;
			}
			if (slot.raw) {
				items.push({ kind: 'children', path: slot.coordinate.path });
				continue;
			}
			if (slot.nativeExpression && slot.residue.kind !== 'element-handle-id') {
				const expr = exprOf(slot.nativeExpression, 'a text expression', scope);
				if (expr)
					items.push({
						kind: 'part',
						part: 'cell' in expr ? { cell: expr.cell } : { expr },
						path: slot.coordinate.path,
					});
				continue;
			}
			if (slot.residue.kind === 'repeat-item') {
				const repeatId = slot.residue.repeatId;
				const expr = slot.residue.path.reduce<NativeExpr>(
					(object, property) => ({ member: object, property }),
					{ item: repeatId },
				);
				items.push({ kind: 'part', part: { expr }, path: slot.coordinate.path });
				continue;
			}
			if (slot.residue.kind !== 'graph-read') {
				refuse(`a text binding the compiler renders once (${slot.residue.kind})`);
				continue;
			}
			const path = slot.residue.path;
			if (scope.module.propBindingIds.has(slot.residue.graphNodeId)) {
				const [name, ...rest] = path;
				const prop = name === undefined ? undefined : scope.props.get(name);
				if (prop?.kind !== 'value') {
					refuse(
						`a text binding that reads the prop \`${name ?? ''}\` this instance was not given as a value`,
					);
					continue;
				}
				const expr = rest.reduce<NativeExpr>(
					(object, property) => ({ member: object, property }),
					prop.expr,
				);
				items.push({
					kind: 'part',
					part: 'cell' in expr ? { cell: expr.cell } : { expr },
					path: slot.coordinate.path,
				});
				continue;
			}
			if (path.length > 1 || (path.length === 1 && path[0] !== 'length')) {
				refuse(`a text binding that reads \`.${path.join('.')}\` of state`);
				continue;
			}
			const read = textPartOf(slot.residue.graphNodeId, scope);
			const part: NativeTextPart | null =
				read && path.length === 1 && 'cell' in read
					? { expr: { member: { cell: read.cell }, property: 'length' } }
					: read;
			if (part) items.push({ kind: 'part', part, path: slot.coordinate.path });
		}
		items.sort((a, b) => comparePaths(a.path, b.path));

		const hostPaths = items.filter((item) => item.kind === 'host');
		const parentOf = (path: ReadonlyArray<number>): string | null => {
			let parent: (typeof hostPaths)[number] | null = null;
			for (const host of hostPaths) {
				if (isPrefix(host.path, path) && (!parent || host.path.length > parent.path.length))
					parent = host;
			}
			return parent ? scope.prefix + parent.id : baseParent;
		};

		let open: { parent: string; parts: NativeTextPart[]; last: ReadonlyArray<number> } | null =
			null;
		const close = () => {
			if (!open) return;
			const index = textRuns.get(open.parent) ?? 0;
			textRuns.set(open.parent, index + 1);
			nodes.push({
				kind: 'text',
				id: `${open.parent}:text${index}`,
				parent: open.parent,
				parts: open.parts,
				...place,
			});
			open = null;
		};
		for (const item of items) {
			const parent = parentOf(item.path);
			if (item.kind === 'host') {
				close();
				const element = scope.module.tagOf.get(item.id);
				if (!element || element === '*') refuse(`host ${item.id} has no static tag`);
				else if (
					!PORTABLE_ELEMENTS.has(element) &&
					!(element === 'title' && scope.module === rootModule && scope.prefix === '')
				)
					refuse(`the <${element}> element`);
				const id = scope.prefix + item.id;
				const spread = chunk.slots.some(
					(slot) =>
						slot.kind === 'spread-attributes' &&
						comparePaths(slot.coordinate.path, item.path) === 0,
				);
				const restAttributes: Record<string, string> = {};
				const restBindings: { attribute: string; value: NativeExpr }[] = [];
				if (spread) {
					for (const [name, value] of scope.rest ?? []) {
						if ('literal' in value) {
							if (value.literal === null || value.literal === false) continue;
							restAttributes[name] =
								value.literal === true ? '' : String(value.literal);
						} else restBindings.push({ attribute: name, value });
					}
				}
				const staticAttributes = Object.fromEntries(
					(chunk.attributes ?? [])
						.filter(
							(attribute) => comparePaths(attribute.coordinate.path, item.path) === 0,
						)
						.map((attribute) => [attribute.name, attribute.value]),
				);
				const attributes = { ...restAttributes, ...staticAttributes };
				if (element === 'dialog' && ('open' in attributes || (scope.module.readsByHost.get(item.id) ?? []).some((read) => read.target.kind === 'attribute' && read.target.name === 'open')))
					refuse('<dialog open>, which the web shows in the page flow as a non-modal dialog; open it with `showModal()`');
				const handleAttrs = handleAttributes(chunk, item.path);
				const own = bindingsOf(
					item.id,
					scope,
					new Set(handleAttrs.map((attribute) => attribute.name)),
				);
				const bindings = [
					...restBindings.filter(
						(binding) =>
							!(binding.attribute in staticAttributes) &&
							!own.some(
								(other) =>
									'attribute' in other && other.attribute === binding.attribute,
							),
					),
					...own,
				];
				for (const attribute of handleAttrs) {
					if (attribute.name === 'id') continue;
					handleReferences.push({
						node: id,
						attribute: attribute.name,
						keys: attribute.handles.map((handle) => handleKey(handle, scope)),
					});
				}
				for (const binding of scope.module.handleBindingsByHost.get(item.id) ?? []) {
					const handle = binding.nativeHandle;
					let key: string | undefined;
					if (handle?.kind === 'member' && handle.object.kind === 'read') {
						const object = scope.objects.get(handle.object.name);
						const instance =
							object?.kind === 'instance' ? object.instance : object?.instance;
						const field = instance?.fields.get(handle.property);
						if (field?.kind === 'handle') key = field.key;
					} else if (handle?.kind === 'read') {
						const bindingId = scope.module.elementBindings.get(
							`${scope.component}#${handle.name}`,
						);
						if (bindingId) key = `${scope.prefix}${bindingId}`;
					}
					if (key) boundHandles.set(key, [...(boundHandles.get(key) ?? []), id]);
				}
				nodes.push({
					kind: 'element',
					id,
					element: element ?? '*',
					parent,
					...(Object.keys(attributes).length > 0 ? { attributes } : {}),
					...(bindings.length > 0 ? { bindings } : {}),
					...place,
				});
				for (const event of scope.module.eventsByHost.get(item.id) ?? []) {
					if (scope.module === rootModule) loweredEvents.add(event.id);
					if (NOT_ON_PHONES.has(event.eventName)) continue;
					if (KEYBOARD_ONLY.has(event.eventName) && !TEXT_ENTRY.has(element ?? '')) {
						keyboardOnly(
							`the ${event.eventName} handler on <${element}> ${id}`,
							event.handlerSpan,
						);
						continue;
					}
					const semantic = SEMANTIC_EVENTS[event.eventName];
					if (!semantic) {
						refuse(
							`the ${event.eventName} event has no native meaning yet`,
							event.handlerSpan,
						);
						continue;
					}
					const handler = { id: `handler:${scope.prefix}${event.id}`, ops: [] as NativeOp[] };
					events.push({ host: id, event: semantic, handler: handler.id });
					handlers.push(handler);
					pendingHandlers.push({ handler, event, scope, host: id });
				}
				continue;
			}
			if (item.kind === 'children') {
				close();
				const children = scope.props.get('children');
				if (children?.kind !== 'children') continue;
				if (parent === null) {
					refuse('`{children}` at the top of a component');
					continue;
				}
				lowerChunk(children.chunk, parent, place, {
					...children.scope,
					shared: scope.shared,
				});
				continue;
			}
			if (item.kind === 'child') {
				close();
				const edge = scope.module.edgesById.get(item.edge);
				if (!edge) {
					refuse(`the component call ${item.edge}`);
					continue;
				}
				if (isPlatformSheet(edge)) {
					lowerSheet(edge, item.projection, parent, place, scope);
					continue;
				}
				const deviceElement = DEVICE_ELEMENTS.find(
					(candidate) =>
						edge.importSource === candidate.module &&
						edge.importedName === candidate.export &&
						edge.importedMemberPath?.length === 1 &&
						edge.importedMemberPath[0] === candidate.member,
				);
				if (deviceElement) {
					const el = edge.props.find((prop) => prop.name === 'el');
					const named = el && 'nativeExpression' in el ? el.nativeExpression : undefined;
					const object =
						named?.kind === 'read' ? scope.deviceObjects.get(named.name) : undefined;
					if (
						!object ||
						object.device !== deviceElement.device ||
						edge.props.some((prop) => prop.name !== 'el')
					) {
						refuse(
							`<${edge.childComponentName}> needs el={…} naming a ${deviceElement.device} the component made, and no other props`,
						);
						continue;
					}
					nodes.push({
						kind: 'element',
						id: scope.prefix + edge.id,
						element: deviceElement.element,
						object: object.id,
						parent,
						...place,
					});
					continue;
				}
				if (isRouterLink(scope, edge.childComponentName)) {
					const href = edge.props.find((prop) => prop.name === 'href');
					const params = edge.props.find((prop) => prop.name === 'params');
					const replace = edge.props.find((prop) => prop.name === 'replace');
					const className = edge.props.find((prop) => prop.name === 'class');
					const projection = item.projection
						? scope.module.chunks.get(item.projection)
						: undefined;
					const paramValues = params ? linkParams(params, scope) : {};
					if (
						href?.kind !== 'serializable' ||
						typeof href.value !== 'string' ||
						!paramValues ||
						(replace &&
							(replace.kind !== 'serializable' ||
								typeof replace.value !== 'boolean')) ||
						(className &&
							(className.kind !== 'serializable' ||
								typeof className.value !== 'string')) ||
						edge.props.some(
							(prop) =>
								!['href', 'params', 'replace', 'class', 'children'].includes(
									prop.name,
								),
						) ||
						(item.projection && !projection)
					) {
						refuse(
							'a <Link> whose href or class is not fixed at build time, or whose params are not strings this build can compute',
						);
						continue;
					}
					const route = linkRoute(href.value, paramValues);
					if (!route) continue;
					const id = scope.prefix + edge.id;
					// The anchor's attributes as the router renders them, so styles see a link (`:any-link`) as the web does.
					const attributes = {
						...(className?.kind === 'serializable' &&
						typeof className.value === 'string'
							? { class: className.value }
							: {}),
						href: href.value,
					};
					nodes.push({ kind: 'element', id, element: 'a', parent, attributes, ...place });
					if (projection) lowerChunk(projection, id, place, scope);
					const handler = `handler:${id}`;
					events.push({ host: id, event: 'activate', handler });
					handlers.push({
						id: handler,
						ops: [
							{
								op: 'navigate',
								...route,
								...(replace?.kind === 'serializable' && replace.value === true
									? { replace: true as const }
									: {}),
							},
						],
					});
					continue;
				}
				const target = componentAt(scope.module, edge.childComponentName);
				const template = target?.module.chunks.get(`template:${target.component}`);
				if (!target || !template) {
					refuse(`<${edge.childComponentName}>, a component from another module`);
					continue;
				}
				const projected = item.projection
					? scope.module.chunks.get(item.projection)
					: undefined;
				// Children a component never renders are dropped, as on the web, so they count as handled.
				if (item.projection && scope.module === rootModule) lowered.add(item.projection);
				if (item.projection && !projected) {
					refuse(`children passed to <${edge.childComponentName}> that have no markup`);
					continue;
				}
				const props = new Map<string, Prop>(
					projected ? [['children', { kind: 'children', chunk: projected, scope }]] : [],
				);
				const declared = new Set(
					target.module.propNames.get(target.component)?.values() ?? [],
				);
				const rest: [string, NativeExpr][] = [];
				const ownRest = scope.module.componentFacts.get(scope.component)?.native?.restProp;
				for (const prop of edge.props) {
					let value: Prop | undefined;
					if (prop.kind === 'spread' && ownRest !== undefined && prop.source === ownRest) {
						// `{...rest}` passed on to a part: the props this instance was given and does not declare.
						for (const [name, expr] of scope.rest ?? [])
							if (declared.has(name)) props.set(name, { kind: 'value', expr });
							else rest.push([name, expr]);
						continue;
					}
					if (prop.kind === 'callback') {
						value = {
							kind: 'callback',
							statements: prop.nativeStatements,
							parameters: prop.parameters ?? [],
							scope,
						};
					} else if (prop.kind === 'serializable' && isNativeValue(prop.value)) {
						value = {
							kind: 'value',
							expr: {
								literal: (isScalar(prop.value) ? prop.value : null) as NativeScalar,
							},
						};
						if (!isScalar(prop.value)) {
							refuse(
								`the \`${prop.name}\` prop of <${edge.childComponentName}> is an object or array`,
							);
							continue;
						}
					} else if (prop.kind === 'opaque' && prop.rowRead && !prop.rowRead.index) {
						const repeatId = `${scope.prefix}${prop.rowRead.repeatId}`;
						if (![...scope.items.values()].includes(repeatId)) {
							refuse(`the \`${prop.name}\` prop of <${edge.childComponentName}> reads a row this build does not render`);
							continue;
						}
						value = {
							kind: 'value',
							expr: prop.rowRead.path.reduce<NativeExpr>((object, property) => ({ member: object, property }), { item: repeatId }),
						};
					} else if (
						prop.kind === 'graph-reference' &&
						scope.cells.byBinding.has(prop.graphNodeId) &&
						prop.path.length === 0
					) {
						value = {
							kind: 'value',
							expr: { cell: scope.cells.byBinding.get(prop.graphNodeId)! },
						};
					} else {
						refuse(`the \`${prop.name}\` prop of <${edge.childComponentName}>`);
						continue;
					}
					if (declared.has(prop.name)) props.set(prop.name, value);
					else if (value.kind === 'value') rest.push([prop.name, value.expr]);
					else
						refuse(
							`the \`${prop.name}\` callback of <${edge.childComponentName}>, which it only spreads onto an element`,
						);
				}
				const childPrefix = `${scope.prefix}${edge.id}/`;
				const childObjects = instanceObjects(target.module, target.component, childPrefix);
				const first = nodes.length;
				const childScope = enterComponent(
					target.module,
					target.component,
					childPrefix,
					props,
					scope.shared,
					target.module === rootModule,
					place.row,
				);
				lowerChunk(template, parent, place, {
					...childScope,
					...(rest.length > 0 ? { rest } : {}),
					deviceObjects: childObjects.byName,
					...(scope.catches ? { catches: scope.catches } : {}),
				});
				childObjects.own(first);
				continue;
			}
			if (item.kind === 'repeat') {
				close();
				const repeat = scope.module.repeatsById.get(item.id);
				const rowChunk = scope.module.chunks.get(item.row);
				if (place.arm || place.row) {
					refuse('@for inside an @if arm or another @for');
					continue;
				}
				if (repeat?.indexKey) {
					refuse('a @for keyed by its index; a native list keys each row by its item');
					continue;
				}
				const list = repeat?.collectionExpression
					? exprOf(repeat.collectionExpression, 'the @for list', scope)
					: repeat?.collectionGraphNodeId !== undefined && scope.cells.byBinding.has(repeat.collectionGraphNodeId) && (repeat.collectionPath?.length ?? 0) === 0
						? { cell: scope.cells.byBinding.get(repeat.collectionGraphNodeId)! }
						: null;
				if (!repeat || !rowChunk || !list) {
					if (!repeat?.collectionExpression) refuse('a @for over something other than a state list keyed by a path of its item');
					continue;
				}
				const repeatId = scope.prefix + item.id;
				nodes.push({ kind: 'repeat', id: repeatId, parent, list, key: repeat.keyPath });
				rowKeys.set(repeatId, repeat.keyPath.reduce<NativeExpr>((object, property) => ({ member: object, property }), { item: repeatId }));
				lowerChunk(rowChunk, parent, { row: repeatId }, { ...scope, items: new Map([...scope.items, [repeat.itemName, repeatId]]) });
				if (item.empty) {
					const emptyChunk = scope.module.chunks.get(item.empty);
					if (!emptyChunk) {
						refuse(`the @empty block of ${item.id} has no markup`);
						continue;
					}
					// `@empty` is a branch whose one arm shows while the list has no rows.
					const branchId = `${repeatId}:empty`;
					nodes.push({
						kind: 'branch',
						id: branchId,
						parent,
						test: { binary: '===', left: { member: list, property: 'length' }, right: { literal: 0 } },
						arms: 1,
					});
					lowerChunk(emptyChunk, parent, { arm: { branch: branchId, index: 0 } }, scope);
				}
				continue;
			}
			if (item.kind === 'boundary') {
				close();
				const boundary = scope.module.boundaries.get(item.id);
				if (place.row || place.arm || scope.boundary) {
					refuse('a @try inside an @if arm, a @for row or another @try');
					continue;
				}
				if (item.arms.catch === undefined) {
					refuse('a @try with no @catch; its error would leave this screen');
					continue;
				}
				const branchId = scope.prefix + item.id;
				const at = nodes.length;
				const tasks = new Set<string>();
				const catchCell = `${branchId}:catch`;
				// Made the first time a handler needs it; a lowering that is rolled back takes it away again.
				const catches: HandlerCatch = {
					cell: () => {
						if (!cellIndex.has(catchCell))
							addCell({
								id: catchCell,
								name: boundary?.errorName ?? 'error',
								initial: null,
							});
						return catchCell;
					},
					used: () => cellIndex.has(catchCell),
				};
				(['try', 'pending', 'catch'] as const).forEach((arm, index) => {
					const armId = item.arms[arm];
					// No @pending shows nothing while the value is on its way.
					if (armId === undefined) return;
					const deferredBefore = pendingHandlers.length;
					const chunk = scope.module.chunks.get(armId);
					if (!chunk) return refuse(`the @${arm} arm of ${item.id} has no markup`);
					lowerChunk(
						chunk,
						parent,
						{ arm: { branch: branchId, index } },
						{
							...scope,
							...(arm === 'try' ? { catches } : {}),
							boundary: {
								tasks,
								arm,
								catches,
								...(boundary?.errorName ? { errorName: boundary.errorName } : {}),
							},
						},
					);
					// The @catch arm reads whether a handler in the @try arm writes its error, so those handlers lower now.
					if (arm === 'try')
						for (const { handler, event, scope: at, host } of pendingHandlers.splice(deferredBefore))
							handler.ops = handlerOps(event, at, handler.id, { target: host, currentTarget: host });
				});
				const caught = catches.used();
				if (tasks.size > 1 || (tasks.size === 0 && !caught)) {
					refuse(
						tasks.size > 1
							? `a @try that waits on ${tasks.size} device values; one is supported`
							: 'a @try that neither reads a device value nor holds a handler that awaits (a device call, or JavaScript)',
					);
					continue;
				}
				const [task] = tasks;
				// A handler's error shows the @catch arm whatever the value is doing.
				const noHandlerError = (test: NativeExpr): NativeExpr =>
					caught
						? {
								logical: '&&',
								left: {
									binary: '===',
									left: { cell: catchCell },
									right: { literal: null },
								},
								right: test,
							}
						: test;
				const state = (value: string): NativeExpr =>
					task === undefined
						? { literal: value === 'value' }
						: {
								binary: '===',
								left: { member: { cell: task }, property: 'state' },
								right: { literal: value },
							};
				nodes.splice(at, 0, {
					kind: 'branch',
					id: branchId,
					parent,
					tests: [noHandlerError(state('value')), noHandlerError(state('pending')), null],
					arms: 3,
				});
				continue;
			}
			if (item.kind === 'branch') {
				close();
				if (place.row) {
					refuse('@if inside a @for row');
					continue;
				}
				const site = scope.module.branchSites.get(item.id);
				if (!site) {
					refuse(`the branch ${item.id}`);
					continue;
				}
				const plain = site.kind === 'if' && site.armIndexSource === undefined;
				const test = plain ? exprOf(site.testExpression, 'the @if test', scope) : undefined;
				const recorded = site.armTestExpressions?.map((expression) =>
					expression === null
						? null
						: exprOf(expression, `the @${site.kind} test`, scope),
				);
				// A chain with no @else still has an empty last arm; showing it when nothing matches shows nothing.
				const tests =
					plain || !recorded
						? undefined
						: recorded.length === item.arms.length - 1 && !recorded.includes(null)
							? [...recorded, null]
							: recorded;
				if (plain ? !test : !tests || tests.length !== item.arms.length) {
					if (!plain && !tests)
						refuse(`a @${site.kind} whose arm tests the compiler did not record`);
					if (tests && tests.length !== item.arms.length)
						refuse(`a @${site.kind} with an empty arm`);
					continue;
				}
				const branchId = scope.prefix + item.id;
				nodes.push({
					kind: 'branch',
					id: branchId,
					parent,
					...(test ? { test } : { tests: tests! as (NativeExpr | null)[] }),
					arms: item.arms.length,
					...place,
				});
				item.arms.forEach((armId, index) => {
					const armChunk = scope.module.chunks.get(armId);
					if (armChunk)
						lowerChunk(armChunk, parent, { arm: { branch: branchId, index } }, scope);
					else refuse(`arm ${armId} has no markup`);
				});
				continue;
			}
			if (parent === null) {
				refuse('text outside an element');
				continue;
			}
			const adjacent =
				open !== null &&
				open.parent === parent &&
				open.last.length === item.path.length &&
				item.path[item.path.length - 1] === open.last[open.last.length - 1]! + 1;
			if (!adjacent) close();
			if (open === null) open = { parent, parts: [], last: item.path };
			open.parts.push(item.part);
			open.last = item.path;
		}
		close();
	};
	/** `<native.sheet>`: a sheet node whose content is the markup between its tags, in the caller's scope. */
	function lowerSheet(
		edge: SemanticComponentEdge,
		projection: string | undefined,
		parent: string | null,
		place: NativePlace,
		scope: Scope,
	) {
		const what = `<${PLATFORM_PIECES_NAMESPACE}.sheet>`;
		if (place.arm || place.row) {
			refuse(`a ${what} inside an @if arm or a @for row`, edge.sourceSpan);
			return;
		}
		const props = new Map(edge.props.map((prop) => [prop.name, prop]));
		const NOT_FIXED = Symbol('not fixed');
		const fixed = (name: string): unknown => {
			const prop = props.get(name);
			if (!prop) return undefined;
			if (prop.kind === 'serializable') return prop.value;
			if (prop.kind === 'opaque' && prop.buildTimeValue) return prop.buildTimeValue.value;
			refuse(`the \`${name}\` prop of ${what}, which must be fixed at build time`, prop.sourceSpan);
			return NOT_FIXED;
		};
		const flag = (name: string): boolean | null => {
			const value = fixed(name) ?? true;
			if (typeof value === 'boolean') return value;
			if (value !== NOT_FIXED)
				refuse(`the \`${name}\` prop of ${what}, which must be true or false`, props.get(name)?.sourceSpan);
			return null;
		};
		for (const prop of edge.props)
			if (
				!['open', 'onChange', 'snapPoints', 'dismissible', 'modal', 'children'].includes(
					prop.name,
				)
			)
				refuse(
					`the \`${prop.name}\` prop of ${what}, which it does not take`,
					prop.sourceSpan,
				);
		const openProp = props.get('open');
		const open: NativeExpr | null =
			openProp === undefined
				? { literal: false }
				: openProp.kind === 'graph-reference'
					? scope.cells.byBinding.has(openProp.graphNodeId) && openProp.path.length === 0
						? { cell: scope.cells.byBinding.get(openProp.graphNodeId)! }
						: refuse(
								`the \`open\` prop of ${what} reads something other than this component's state`,
								openProp.sourceSpan,
							)
					: openProp.kind === 'serializable' && typeof openProp.value === 'boolean'
						? { literal: openProp.value }
						: refuse(
								`the \`open\` prop of ${what}, which must be state or true or false`,
								openProp.sourceSpan,
							);
		const points = fixed('snapPoints') ?? [1];
		const portableHeights =
			Array.isArray(points) &&
			points.length >= 1 &&
			points.length <= 2 &&
			points.every((point) => typeof point === 'number' && point > 0 && point <= 1) &&
			Math.max(...(points as number[])) === 1 &&
			new Set(points).size === points.length;
		if (points !== NOT_FIXED && !portableHeights)
			refuse(
				`\`snapPoints\` of ${what}: one or two fractions of the screen's height, the largest 1 (Android's sheet has one height between collapsed and full)`,
				props.get('snapPoints')?.sourceSpan,
			);
		const snapPoints = portableHeights ? [...(points as number[])].sort((a, b) => a - b) : null;
		const dismissible = flag('dismissible');
		const modal = flag('modal');
		if (modal === false)
			refuse(
				`a ${what} with \`modal={false}\`: Android's non-modal sheet sits in the page's own layout, which hosts do not build yet`,
				props.get('modal')?.sourceSpan,
			);
		const onChange = props.get('onChange');
		if (dismissible === true && !onChange)
			refuse(
				`a dismissible ${what} without \`onChange\`: the platform closes it, and the page's state must hear it`,
				edge.sourceSpan,
			);
		if (onChange && onChange.kind !== 'callback')
			refuse(
				`the \`onChange\` prop of ${what}, which must be a function written where it is passed`,
				onChange.sourceSpan,
			);
		const projected = projection ? scope.module.chunks.get(projection) : undefined;
		if (projection && !projected)
			refuse(`children passed to ${what} that have no markup`, edge.sourceSpan);
		const id = `sheet:${scope.prefix}${edge.id}`;
		if (open && snapPoints && dismissible !== null && modal !== null)
			nodes.push({ kind: 'sheet', id, parent, open, snapPoints, dismissible, modal });
		if (projected) lowerChunk(projected, id, {}, scope);
		if (onChange?.kind === 'callback' && dismissible === true) {
			if (!onChange.nativeStatements) {
				refuse(
					`the \`onChange\` of ${what} is defined elsewhere (a named or factory function)`,
					onChange.sourceSpan,
				);
				return;
			}
			const [parameter] = onChange.parameters ?? [];
			const handler = `handler:${id}`;
			events.push({ host: id, event: 'dismiss', handler });
			continuations = { base: handler, next: 0 };
			snapshots = { handler, count: 0 };
			handlers.push({
				id: handler,
				ops: lowerStatements(
					onChange.nativeStatements,
					parameter === undefined
						? scope
						: { ...scope, args: new Map([...scope.args, [parameter, { literal: false }]]) },
					`the \`onChange\` of ${what}`,
					onChange.sourceSpan,
					0,
				).ops,
			});
		}
	}

	/**
	 * A handler's ops: data where it lowers, else one `script` op running its own JavaScript. With `scriptHandlers: 'all'`,
	 * JavaScript wherever a script can run it.
	 */
	function handlerOps(
		event: SemanticEvent,
		scope: Scope,
		handler: string,
		pressed?: NonNullable<Scope['pressed']>,
	): NativeOp[] {
		if (scriptMode === 'never' || !event.handlerScript) return dataHandlerOps(event, scope, handler, pressed);
		if (scriptMode === 'all') {
			const scripted = attempt(() => scriptOp(event, scope));
			if (scripted.value && !scripted.failed) return [scripted.value];
			scripted.rollBack();
			return dataHandlerOps(event, scope, handler, pressed);
		}
		const data = attempt(() => dataHandlerOps(event, scope, handler, pressed));
		if (!data.failed) return data.value;
		data.rollBack();
		// When the script cannot run it either, what stops the script names what a phone lacks: those refusals stay.
		const scripted = scriptOp(event, scope);
		return scripted ? [scripted] : [];
	}

	/** Runs `run`, then says whether it refused, and can undo what it added (refusals, cells, dialog ops, features). */
	function attempt<T>(run: () => T): {
		readonly value: T;
		readonly failed: boolean;
		readonly rollBack: () => void;
		readonly refusals: () => CompilerDiagnostic[];
	} {
		const marks = {
			diagnostics: diagnostics.length,
			cells: cells.length,
			dialogOps: dialogOps.length,
			features: new Set(features),
			snapshots: snapshots.count,
			continuations: continuations.next,
		};
		const value = run();
		const added = diagnostics.slice(marks.diagnostics);
		return {
			value,
			failed: added.some((diagnostic) => diagnostic.severity === 'error'),
			refusals: () => added.filter((diagnostic) => diagnostic.severity === 'error'),
			rollBack: () => {
				diagnostics.splice(marks.diagnostics, diagnostics.length - marks.diagnostics, ...added.filter((diagnostic) => diagnostic.severity !== 'error'));
				for (const dropped of cells.splice(marks.cells)) cellIndex.delete(dropped.id);
				dialogOps.length = marks.dialogOps;
				features.clear();
				for (const feature of marks.features) features.add(feature);
				snapshots.count = marks.snapshots;
				continuations.next = marks.continuations;
			},
		};
	}

	function scriptOp(event: SemanticEvent, scope: Scope): NativeOp | null {
		const fact = event.handlerScript!;
		const what = `the ${event.eventName} handler`;
		let readsMissing = false;
		for (const read of fact.event ?? []) {
			const known = NATIVE_SCRIPT_EVENT_MEMBERS.some((members) =>
				members.every((member, index) => index >= read.path.length || read.path[index] === member) &&
				(read.path.length <= members.length || members.length === 2),
			);
			if (known) continue;
			readsMissing = true;
			const doing = SEMANTIC_EVENTS[event.eventName] === 'input' ? 'a text edit' : 'a tap';
			refuseScript(`${what} reads \`event.${read.path.join('.')}\`, which ${doing} on a phone does not have`, read.span);
		}
		const fn = scriptFunctionId(fact, scope.module, what);
		const bindings = scriptBindings(fact, scope, what);
		if (fn === null || bindings === null || readsMissing) return null;
		const caught =
			(event.handlerCatchBoundaryId !== undefined || event.dispatchCatchBoundaryId !== undefined) && scope.catches
				? scope.catches.cell()
				: undefined;
		return { op: 'script', fn, bindings, ...(caught ? { catch: caught } : {}) };
	}

	function dataHandlerOps(
		event: SemanticEvent,
		scope: Scope,
		handler: string,
		pressed?: NonNullable<Scope['pressed']>,
	): NativeOp[] {
		const what = `the ${event.eventName} handler`;
		const [parameter, ...more] = event.handlerParameters;
		if (more.length > 0) {
			refuse(`${what} reads its event`, event.handlerSpan);
			return [];
		}
		if (!event.handlerStatements) {
			refuse(`${what} is defined elsewhere (a named or factory function)`, event.handlerSpan);
			return [];
		}
		const inner: Scope =
			parameter === undefined
				? scope
				: event.eventName === 'input'
					? { ...scope, event: parameter }
					: { ...scope, opaque: parameter, ...(pressed ? { pressed } : {}) };
		snapshots = { handler, count: 0 };
		continuations = { base: handler, next: 0 };
		return lowerStatements(event.handlerStatements, inner, what, event.handlerSpan, 0).ops;
	}

	/** The one device call a statement awaits, and the statement's value with that await replaced by `as`. */
	function splitAwait(
		expression: SemanticExpression,
		as: string,
	): {
		readonly call: DeviceCallSite | null;
		readonly rest: SemanticExpression;
		readonly count: number;
	} {
		let call: DeviceCallSite | null = null;
		let count = 0;
		const walk = (node: SemanticExpression): SemanticExpression => {
			if (node.kind === 'await') {
				count++;
				call = methodCallSite(node.value);
				return { kind: 'read', name: as };
			}
			const copy: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(node))
				copy[key] = Array.isArray(value)
					? value.map((item) =>
							Array.isArray(item)
								? item.map((inner) =>
										inner && typeof inner === 'object' && 'kind' in inner
											? walk(inner as SemanticExpression)
											: inner,
									)
								: item && typeof item === 'object' && 'kind' in item
									? walk(item as SemanticExpression)
									: item &&
										  typeof item === 'object' &&
										  'value' in item &&
										  typeof (item as { value: unknown }).value === 'object'
										? {
												...item,
												value: walk(
													(item as { value: SemanticExpression }).value,
												),
											}
										: item,
						)
					: value && typeof value === 'object' && 'kind' in value
						? walk(value as SemanticExpression)
						: value;
			return copy as SemanticExpression;
		};
		const rest = walk(expression);
		return { call, rest, count };
	}

	/** A device call by its callee: an import's (`haptics.tap`) or a device object's (`cam.takePhoto`). */
	function deviceCallOf(
		value: DeviceCallSite,
		scope: Scope,
		what: string,
		span: SourceSpan | undefined,
	): { readonly call: NativeDeviceCall; readonly object?: string } | null {
		const [local, method, ...more] = value.calleePath;
		const object =
			local !== undefined && !scope.locals.has(local) ? scope.deviceObjects.get(local) : undefined;
		const device =
			object && method !== undefined && more.length === 0
				? `${object.device}.${method}`
				: deviceName(value.calleePath, scope);
		if (device === undefined) {
			refuse(`${what} uses a call to \`${value.callee}\`, which needs a script engine`, span);
			return null;
		}
		if (!isDeviceCall(device) || 'object' in DEVICE_CALLS[device] !== (object !== undefined)) {
			refuse(
				`${what} calls \`${device}\`, which ${DEVICE_MODULE} has no native call for yet`,
				span,
			);
			return null;
		}
		features.add(DEVICE_CALLS[device].feature);
		return { call: device, ...(object ? { object: object.id } : {}) };
	}

	/** The handler being lowered, which owns the cells its `const`s are kept in when what they read changes. */
	let snapshots = { handler: '', count: 0 };
	/** The handler being lowered's awaited device calls, each continuation named `<base>:after:<n>`. */
	let continuations = { base: '', next: 0 };
	/** How many `if` branches deep the statements being lowered are: an awaited call's continuation cannot leave one yet. */
	let branchDepth = 0;

	/**
	 * Lowers `run` with each name bound to its value. When the ops it gives may change what a value reads before reading
	 * it, lowers again with that value kept, as it was here, in a cell of its own that is written first.
	 */
	function lowerBound(
		bindings: ReadonlyArray<readonly [string, NativeExpr]>,
		run: (values: ReadonlyArray<NativeExpr>) => { readonly ops: NativeOp[]; readonly returns: boolean },
	): { readonly ops: NativeOp[]; readonly returns: boolean } {
		const marks = { diagnostics: diagnostics.length, dialogOps: dialogOps.length, cells: cells.length, count: snapshots.count };
		const first = run(bindings.map(([, value]) => value));
		const kept = bindings.map(([, value]) => mayChangeBeforeRead(first.ops, cellsOf(value)));
		if (!kept.includes(true)) return first;
		diagnostics.length = marks.diagnostics;
		dialogOps.length = marks.dialogOps;
		for (const dropped of cells.splice(marks.cells)) cellIndex.delete(dropped.id);
		snapshots.count = marks.count;
		const ops: NativeOp[] = [];
		const values = bindings.map(([name, value], index): NativeExpr => {
			if (!kept[index]) return value;
			const cell = `${snapshots.handler}/kept:${snapshots.count++}`;
			addCell({ id: cell, name, initial: null });
			ops.push({ op: 'assign', cell, value });
			return { cell };
		});
		const second = run(values);
		return { ops: [...ops, ...second.ops], returns: second.returns };
	}

	/** Whether running `ops` may change a cell of `read` before a later op reads it; one assignment reads before it writes. */
	const mayChangeBeforeRead = (ops: ReadonlyArray<NativeOp>, read: ReadonlySet<string>): boolean =>
		!(ops.length === 1 && ops[0]!.op === 'assign') && [...writesOf(ops)].some((cell) => read.has(cell));

	/** Cells an op list may write, inside `if` ops and awaited calls' continuations too. */
	const writesOf = (ops: ReadonlyArray<NativeOp>, into = new Set<string>()): Set<string> => {
		for (const op of ops) {
			if (op.op === 'assign') into.add(op.cell);
			else if (op.op === 'if') {
				writesOf(op.whenTrue, into);
				writesOf(op.whenFalse, into);
			}
			else if (op.op === 'call' && op.after) writesOf(op.after.ops, into);
			else if (op.op === 'script')
				for (const binding of Object.values(op.bindings)) {
					if ('cell' in binding) into.add(binding.cell);
					else if ('fields' in binding) for (const cell of Object.values(binding.fields)) into.add(cell);
				}
		}
		return into;
	};

	/**
	 * Statements as ops. An `if` is an `if` op; a `return` moves the statements after its `if` into the other branch, so
	 * nothing after it runs. `returns` says whether the list always returns.
	 */
	function lowerStatements(
		statements: ReadonlyArray<SemanticHandlerStatement>,
		scope: Scope,
		what: string,
		span: SourceSpan | undefined,
		depth: number,
	): { readonly ops: NativeOp[]; readonly returns: boolean } {
		const ops: NativeOp[] = [];
		for (let index = 0; index < statements.length; index++) {
			const statement = statements[index]!;
			// A statement that awaits a device call: the call, then the rest of the handler as its continuation.
			const awaited =
				statement.kind === 'effect' && statement.value.kind === 'await'
					? splitAwait(statement.value, '')
					: statement.kind === 'assign'
						? splitAwait(statement.value, `$${continuations.next}`)
						: null;
			if (awaited && awaited.count > 0) {
				if (awaited.count > 1 || !awaited.call || branchDepth > 0) {
					refuse(
						`${what} awaits ${awaited.count > 1 ? 'more than once in one statement' : branchDepth > 0 ? 'inside an `if`' : 'something other than a call'}`,
						span,
					);
					return { ops, returns: true };
				}
				const target = deviceCallOf(awaited.call, scope, what, span);
				if (!target) return { ops, returns: true };
				const as = `$${continuations.next}`;
				const id = `${continuations.base}:after:${continuations.next++}`;
				const inner: Scope = { ...scope, locals: new Set([...scope.locals, as]) };
				const remaining: SemanticHandlerStatement[] = [
					...(statement.kind === 'effect'
						? []
						: [{ ...statement, value: awaited.rest } as SemanticHandlerStatement]),
					...statements.slice(index + 1),
				];
				const args = awaited.call.arguments.map((argument) => exprOf(argument, what, scope));
				if (!args.every((argument) => argument !== null)) return { ops, returns: true };
				ops.push({
					op: 'call',
					...target,
					arguments: args as NativeExpr[],
					after: {
						id,
						as,
						ops: lowerStatements(remaining, inner, what, span, depth).ops,
						...(scope.catches ? { catch: scope.catches.cell() } : {}),
					},
				});
				// What follows the await runs in the continuation, once the call answers.
				return { ops, returns: true };
			}
			if (statement.kind === 'return') return { ops, returns: true };
			if (statement.kind === 'const') {
				const value = exprOf(statement.value, what, scope);
				if (!value) return { ops, returns: true };
				const rest = statements.slice(index + 1);
				const after = lowerBound([[statement.name, value]], ([bound]) =>
					lowerStatements(rest, bindName(scope, statement.name, bound!), what, span, depth),
				);
				ops.push(...after.ops);
				return { ops, returns: after.returns };
			}
			if (statement.kind === 'if') {
				const test = exprOf(statement.test, `${what}'s \`if\` test`, scope);
				if (!test) return { ops, returns: true };
				// A test about elements or a tap's modifier keys is answered when the app is built: only its branch is lowered.
				const known = mentionsElement(test) || lateLowering ? foldConstant(test, () => undefined) : undefined;
				if (known) {
					const taken = [...(known.value ? statement.whenTrue : statement.whenFalse), ...statements.slice(index + 1)];
					const rest = lowerStatements(taken, scope, what, span, depth);
					ops.push(...rest.ops);
					return { ops, returns: rest.returns };
				}
				branchDepth++;
				const then = lowerStatements(statement.whenTrue, scope, what, span, depth);
				const otherwise = lowerStatements(statement.whenFalse, scope, what, span, depth);
				branchDepth--;
				// A branch that returns takes nothing after the `if`; the other branch runs the rest.
				const rest =
					then.returns !== otherwise.returns
						? lowerStatements(statements.slice(index + 1), scope, what, span, depth)
						: undefined;
				ops.push({
					op: 'if',
					test,
					whenTrue: rest && !then.returns ? [...then.ops, ...rest.ops] : then.ops,
					whenFalse:
						rest && !otherwise.returns
							? [...otherwise.ops, ...rest.ops]
							: otherwise.ops,
				});
				if (then.returns && otherwise.returns) return { ops, returns: true };
				if (rest) return { ops, returns: rest.returns };
				continue;
			}
			ops.push(...statementOps(statement, scope, what, span, depth));
		}
		return { ops, returns: false };
	}

	function statementOps(
		statement: Exclude<SemanticHandlerStatement, { kind: 'if' } | { kind: 'return' } | { kind: 'const' }>,
		scope: Scope,
		what: string,
		span: SourceSpan | undefined,
		depth: number,
	): NativeOp[] {
		if (statement.kind === 'effect') {
			refuse(`${what} uses an \`await\` of something other than a device call, which needs a script engine`, span);
			return [];
		}
		// `haptics.tap()` or `cam.flip()` as a statement: a device call.
		if (statement.kind === 'invoke' && statement.path && statement.path.length > 0) {
			const site: DeviceCallSite = {
				callee: [statement.name, ...statement.path].join('.'),
				calleePath: [statement.name, ...statement.path],
				arguments: statement.arguments ?? [],
			};
			if (isDeviceCallSite(site, scope)) {
				const target = deviceCallOf(site, scope, what, span);
				if (!target) return [];
				const args = site.arguments.map((argument) => exprOf(argument, what, scope));
				return args.every((argument) => argument !== null)
					? [{ op: 'call', ...target, arguments: args as NativeExpr[] }]
					: [];
			}
		}
		// `cam.facing = 'front'`: a write to a setting of a device object.
		if (
			statement.kind === 'assign' &&
			statement.path?.length === 1 &&
			!scope.locals.has(statement.target) &&
			scope.deviceObjects.has(statement.target)
		) {
			const object = scope.deviceObjects.get(statement.target)!;
			const fieldName = statement.path[0]!;
			const field = `${object.device}.${fieldName}`;
			if (!isDeviceValue(field) || !('writable' in DEVICE_VALUES[field])) {
				refuse(
					`${what} writes \`${statement.target}.${fieldName}\`, which is not a setting of a device object`,
					span,
				);
				return [];
			}
			const cell = objectFieldCell(statement.target, object, fieldName, what);
			const value = exprOf(statement.value, what, scope);
			return cell && value
				? [
						{ op: 'assign', cell, value },
						{
							op: 'call',
							call: field as NativeDeviceCall,
							object: object.id,
							arguments: [{ cell }],
						},
					]
				: [];
		}
		if (statement.kind === 'unsupported') {
			refuse(`${what} uses ${statement.construct}, which needs a script engine`, span);
			return [];
		}
		if (statement.kind === 'invoke') {
			const callee = [statement.name, ...(statement.path ?? [])].join('.');
			const notCallable = () => {
				refuse(`${what} uses a call to \`${callee}\`, which needs a script engine`, span);
				return [];
			};
			if (depth > 8) return notCallable();
			const imported = statement.path ? undefined : scope.module.imports.get(statement.name);
			if (imported?.source === '@markless/router' && imported.importedName === 'navigate')
				return navigateOps(statement.arguments ?? [], what, span);
			const command = statement.path?.at(-1);
			const receiver = statement.path?.slice(0, -1) ?? [];
			const receiverField =
				receiver.length === 1
					? (() => {
							const object = scope.objects.get(statement.name);
							return (object?.kind === 'instance' ? object.instance : object?.instance)?.fields.get(receiver[0]!);
						})()
					: undefined;
			const onElement =
				(command === 'focus' || command === 'scrollIntoView') &&
				(receiverField?.kind === 'handle' || (receiver.length === 0 && (scope.args.has(statement.name) || !scope.objects.has(statement.name))));
			if (onElement) {
				const holder = receiver.reduce<SemanticExpression>(
					(object, property) => ({ kind: 'member', object, property }),
					{ kind: 'read', name: statement.name },
				);
				const mark = diagnostics.length;
				const target = exprOf(holder, `${what}'s call to \`${callee}\``, scope);
				const element = elementOf(target);
				// `focus({ preventScroll })` is the one option a native host keeps; any other option is refused by name.
				const [options, ...extra] = statement.arguments ?? [];
				const preventScroll =
					command === 'focus' && options?.kind === 'object' && extra.length === 0 && options.entries.every(([key, value]) => key === 'preventScroll' && value.kind === 'literal' && typeof value.value === 'boolean')
						? options.entries.some(([, value]) => value.kind === 'literal' && value.value === true)
						: undefined;
				if (element !== undefined && options && preventScroll === undefined) {
					refuse(`${what} calls \`${callee}()\` with options other than \`{ preventScroll }\`, which no native host takes yet`, span);
					return [];
				}
				if (element !== undefined)
					return [{ op: 'command', node: element, command: command as 'focus' | 'scrollIntoView', ...(preventScroll ? { preventScroll: true as const } : {}) }];
				if (target && 'literal' in target && target.literal === null && statement.optional) return [];
				if (diagnostics.length > mark) return [];
				return notCallable();
			}
			let body:
				| {
						statements: ReadonlyArray<SemanticHandlerStatement> | undefined;
						parameters: ReadonlyArray<string>;
						scope: Scope;
				  }
				| undefined;
			let absent = false;
			const path = statement.path ?? [];
			const handle = path.length === 1 ? scope.module.elementBindings.get(`${scope.component}#${statement.name}`) : undefined;
			if (handle && (path[0] === 'showModal' || path[0] === 'close') && (statement.arguments ?? []).length === 0) {
				// The node is the element the handle is bound to, known once the whole tree is lowered.
				const op = { op: 'dialog' as const, node: `${scope.prefix}${handle}`, method: path[0] as 'showModal' | 'close' };
				dialogOps.push(op);
				return [op];
			}
			if (path.length === 0) {
				const prop = propOf(statement.name, scope);
				if (prop?.kind === 'callback') body = prop;
				else if (!prop && isPropName(statement.name, scope)) absent = true;
			} else if (path.length === 1) {
				const object = scope.objects.get(statement.name);
				const instance = object?.kind === 'instance' ? object.instance : object?.instance;
				const field = instance?.fields.get(path[0]!);
				if (field?.kind === 'method')
					body = {
						statements: field.statements,
						parameters: field.parameters,
						scope: instance!.scope,
					};
				else if (field?.kind === 'slot') {
					const slot = instance!.slots.get(path[0]!);
					if (slot?.kind === 'callback') body = slot;
					else absent = true;
				}
			}
			if (absent) {
				if (statement.optional) return [];
				refuse(`${what} calls \`${callee}\`, which this instance was not given`, span);
				return [];
			}
			if (!body?.statements) return notCallable();
			const args = (statement.arguments ?? []).map((argument) =>
				exprOf(argument, `${what}'s call to \`${callee}\``, scope),
			);
			if (args.some((argument) => argument === null)) return [];
			const { statements, parameters, scope: inner } = body;
			return lowerBound(
				parameters.map((name, index) => [name, args[index] ?? { literal: null }] as const),
				(values) => {
					const bound = new Map(inner.args);
					parameters.forEach((name, index) => bound.set(name, values[index]!));
					return lowerStatements(
						statements,
						{ ...inner, args: bound, locals: new Set([...inner.locals].filter((name) => !bound.has(name))) },
						what,
						span,
						depth + 1,
					);
				},
			).ops;
		}
		if (statement.path && statement.path.length > 0) {
			const object = scope.objects.get(statement.target);
			const field = statement.path.length === 1 ? statement.path[0]! : undefined;
			const cell =
				field === undefined
					? undefined
					: object?.kind === 'fields'
						? object.cells.get(field)
						: object?.kind === 'instance'
							? (() => {
									const found = object.instance.fields.get(field);
									return found?.kind === 'cell' ? found.cell : undefined;
								})()
							: undefined;
			if (!cell) {
				refuse(
					`${what} assigns \`${statement.target}.${statement.path.join('.')}\`, which is not a field of state`,
					span,
				);
				return [];
			}
			const value = exprOf(statement.value, what, scope);
			return value ? [{ op: 'assign', cell, value }] : [];
		}
		const cell = cellOf(statement.target, scope);
		if (!cell) {
			refuse(
				`${what} assigns \`${statement.target}\`, which is not state of this component`,
				span,
			);
			return [];
		}
		const value = exprOf(statement.value, what, scope);
		return value ? [{ op: 'assign', cell, value }] : [];
	}

	/** `navigate('/orders/42', { replace: true })`: a path fixed at build time, resolved against the app's routes. */
	function navigateOps(
		args: ReadonlyArray<SemanticExpression>,
		what: string,
		span: SourceSpan | undefined,
	): NativeOp[] {
		const [href, settings] = args;
		const path =
			href?.kind === 'literal' && typeof href.value === 'string' ? href.value : undefined;
		const replace =
			settings === undefined
				? false
				: settings.kind === 'object' &&
					  settings.entries.every(
							([name, value]) =>
								name === 'replace' &&
								value.kind === 'literal' &&
								typeof value.value === 'boolean',
					  )
					? settings.entries.some(
							([, value]) => value.kind === 'literal' && value.value === true,
						)
					: undefined;
		if (path === undefined || replace === undefined || args.length > 2) {
			refuse(
				`${what} calls navigate() with a path or options this build cannot fix at build time`,
				span,
			);
			return [];
		}
		const matched = options.resolvePath?.(path);
		if (!matched) {
			refuse(`${what} navigates to ${path}, which is not a route of this app`, span);
			return [];
		}
		const route = linkRoute(matched.pattern, matched.params);
		return route
			? [{ op: 'navigate', ...route, ...(replace ? { replace: true as const } : {}) }]
			: [];
	}

	const rootObjects = instanceObjects(rootModule, root.componentName, '');
	const TOP: Scope = {
		...enterComponent(
			rootModule,
			root.componentName,
			'',
			new Map<string, Prop>(
				options.route ? [['params', { kind: 'value', expr: { route: 'params' } }]] : [],
			),
			new Map(),
			true,
		),
		deviceObjects: rootObjects.byName,
	};
	lowerChunk(rootChunk, null, {}, TOP);
	const titles = nodes.filter((node) => node.kind === 'element' && node.element === 'title');
	let title: NativeTextPart[] | undefined;
	if (titles.length > 1) refuse('more than one <title>');
	for (const element of titles) {
		const inside = nodes.filter((node) => node.parent === element.id);
		if (element.arm || element.row) refuse('a <title> inside an @if arm or a @for row');
		if (inside.some((node) => node.kind !== 'text'))
			refuse('a <title> holding something other than text');
		if (events.some((event) => event.host === element.id))
			refuse('a <title> with an event handler');
		title = inside.flatMap((node) => (node.kind === 'text' ? node.parts : []));
		const removed = new Set([element.id, ...inside.map((node) => node.id)]);
		nodes.splice(0, nodes.length, ...nodes.filter((node) => !removed.has(node.id)));
	}
	rootObjects.own(0);
	if (graph.markup.chunks.some((chunk) => chunk.kind !== 'template' && !lowered.has(chunk.id)))
		refuse('markup outside the root template, its @if arms and its @for rows');
	for (const event of graph.events)
		if (!loweredEvents.has(event.id))
			refuse(`the ${event.eventName} handler on an element this build does not show`);

	const rowOfNode = new Map(nodes.map((node) => [node.id, node.row]));
	for (const reference of handleReferences) {
		const ids = reference.keys.flatMap((key) =>
			key === undefined ? [] : (boundHandles.get(key) ?? []),
		);
		if (ids.length === 0) continue;
		const index = nodes.findIndex(
			(node) => node.id === reference.node && node.kind === 'element',
		);
		const node = nodes[index] as Extract<NativeNode, { kind: 'element' }>;
		// An element in a row names the same row's copy (`<id>@<key>`), as each web row mints its own ids.
		const parts: (string | NativeExpr)[] = [];
		for (const [position, id] of ids.entries()) {
			const row = rowOfNode.get(id);
			if (row && row !== node.row) {
				refuse(`the \`${reference.attribute}\` attribute of ${node.id} names an element inside a @for row it is not in`);
				continue;
			}
			parts.push(`${position > 0 ? ' ' : ''}${id}${row ? '@' : ''}`);
			if (row) parts.push(rowKeys.get(row)!);
		}
		const value: NativeExpr = parts.every((part) => typeof part === 'string')
			? { literal: parts.join('') }
			: { template: parts };
		nodes[index] = {
			...node,
			bindings: [...(node.bindings ?? []), { attribute: reference.attribute, value }],
		};
	}

	// A tap lands on the innermost element that handles it, so a handler that reads `event.target` runs once per element a
	// part names inside its host (rows, triggers): the containment it asks about is the same for every element within one.
	lateLowering = true;
	for (const { handler, event, scope, host } of pendingHandlers) {
		pressedTargetRead = false;
		handler.ops = handlerOps(event, scope, handler.id, { target: host, currentTarget: host });
		if (!pressedTargetRead || SEMANTIC_EVENTS[event.eventName] !== 'activate') continue;
		const named = new Set([...boundHandles.values()].flat());
		// What a tap on each element runs; a tap on an element with no handler of its own reaches the nearest one around it.
		const runs = new Map<string, { readonly id: string; readonly spelled: string }>([
			[host, { id: handler.id, spelled: JSON.stringify(handler.ops) }],
		]);
		const reached = (node: string) => {
			const byId = nodeById();
			for (let at = byId.get(node)?.parent; at; at = byId.get(at)?.parent) if (runs.has(at)) return runs.get(at);
			return undefined;
		};
		for (const node of nodes) {
			if (node.kind !== 'element' || node.id === host || !named.has(node.id) || node.row || !isWithin(node.id, host)) continue;
			if (events.some((other) => other.host === node.id && other.event === 'activate')) {
				refuse(`a press on ${node.id} is handled by its own click handler and by the one on ${host}, which reads where it landed`, event.handlerSpan);
				continue;
			}
			const pressed = { target: node.id, currentTarget: host };
			const marks = { diagnostics: diagnostics.length, cells: cells.length };
			const rollBack = () => {
				diagnostics.length = marks.diagnostics;
				for (const dropped of cells.splice(marks.cells)) cellIndex.delete(dropped.id);
			};
			// Lowered as the run it would reach, kept values and all: the same ops mean it needs no handler of its own.
			const around = reached(node.id);
			if (around) {
				const same = JSON.stringify(handlerOps(event, scope, around.id, pressed)) === around.spelled;
				rollBack();
				if (same) continue;
			}
			const id = `${handler.id}@${node.id}`;
			const ops = handlerOps(event, scope, id, pressed);
			// The same refusal once per tapped element says nothing new.
			const seen = new Set(diagnostics.slice(0, marks.diagnostics).map((diagnostic) => diagnostic.message));
			diagnostics.splice(marks.diagnostics, diagnostics.length - marks.diagnostics, ...diagnostics.slice(marks.diagnostics).filter((diagnostic) => !seen.has(diagnostic.message)));
			runs.set(node.id, { id, spelled: JSON.stringify(ops) });
			events.push({ host: node.id, event: 'activate', handler: id });
			handlers.push({ id, ops });
		}
		// The host's own run does nothing once the elements in it have theirs: it is not a control then.
		if (handler.ops.length === 0 && runs.size > 1) {
			events.splice(events.findIndex((entry) => entry.handler === handler.id), 1);
			handlers.splice(handlers.indexOf(handler), 1);
		}
	}
	for (const handler of handlers)
		if (mentionsElement(handler.ops)) refuse(`${handler.id} keeps an element as a value, which a native host has no use for yet`);
	lateLowering = false;

	for (const op of dialogOps) {
		const bound = boundHandles.get(op.node) ?? [];
		const element = bound.length === 1 ? nodes.find((node) => node.id === bound[0]) : undefined;
		if (element?.kind !== 'element' || element.element !== 'dialog' || element.arm || element.row) {
			refuse(`\`.${op.method}()\` on a handle that is not bound to exactly one <dialog> outside @if and @for`);
			continue;
		}
		op.node = element.id;
	}

	// Dragon lays out one style assignment per combination of these: every cell a class reads, and every true/false cell
	// an attribute Dragon receives per state reads (`[ui-open]`, `[hidden]`).
	// A cell no handler writes keeps its first value, so it adds no assignment.
	const written = writesOf(handlers.flatMap((handler) => handler.ops));
	const styledCells = new Set<string>();
	// A row's state has a value per row, which one style assignment per combination of states cannot follow.
	const rowCells = new Set(cells.flatMap((cell) => (cell.row ? [cell.id] : [])));
	for (const node of nodes)
		if (node.kind === 'element')
			for (const binding of node.bindings ?? []) {
				if (!('attribute' in binding)) continue;
				if (binding.attribute === 'class') cellsOf(binding.value, styledCells);
				else if (isNativeStyleStateAttribute(binding.attribute))
					for (const cell of cellsOf(binding.value))
						if (written.has(cell) && typeof initialOf(cell) === 'boolean')
							styledCells.add(cell);
			}

	const script = buildScript();
	return done({
		version: NATIVE_VIEW_VERSION,
		component: root.componentName,
		...(options.route
			? { route: { pattern: options.route.pattern, params: options.route.params } }
			: {}),
		cells: cells.map((cell) =>
			styledCells.has(cell.id) && !rowCells.has(cell.id) ? { ...cell, styled: true as const } : cell,
		),
		nodes,
		events,
		handlers,
		...(title ? { title } : {}),
		...(objects.length > 0 ? { objects } : {}),
		...(script ? { script } : {}),
	});
}
