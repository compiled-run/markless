import type {
	SemanticEvent,
	SemanticExpression,
	SemanticHandlerStatement,
	SemanticNameOrigin,
	SemanticNativeGap,
} from '@markless/compiler';

/** A handler body as the native build sees it: data today, data with a named extension, or general JavaScript. */
export type HandlerClass = 1 | 2 | 3;

export type HandlerVerdict = {
	readonly class: HandlerClass;
	/** Named, bounded additions to the data vocabulary this handler needs (class 2 when this is all it needs). */
	readonly extensions: ReadonlyArray<Extension>;
	/** Why this handler needs a general JavaScript engine (class 3). */
	readonly reasons: ReadonlyArray<string>;
	/** The event is one the native payload does not map yet (keys, focus, pointer, submit...): a host gap, not a language gap. */
	readonly eventOutsideVocabulary: boolean;
};

/** Each extension is one bounded step for the data vocabulary; the report lists them with what they unlock. */
export const EXTENSIONS = {
	locals: 'local names inside a handler (`const x = ...`)',
	control: '`if`, early `return`, `switch` and `throw` in a handler',
	loop: 'a loop over a list',
	await: 'statements after an `await` (continuation)',
	ownFunction: 'a call to your own function, inlined at build time',
	sharedMethod: 'a method of `shared()` state, inlined at build time',
	callbackArgs: 'calling a received callback with arguments, or `?.()`',
	fieldWrite: 'writing a field of a state object or list row (`row.done = true`)',
	listEdit: 'editing a list in place (`push`, `splice`, `sort`)',
	methods: 'more string and array methods (`split`, `startsWith`, `reduce`...)',
	stdlib: 'more standard functions (`Math.*`, `JSON.*`, `Object.keys`, `parseInt`...)',
	dates: 'dates, the clock and locale formatting',
	eventFields: 'reading the event (`event.key`, `event.target.checked`)',
	eventFlags: '`event.preventDefault()` and `stopPropagation()`',
	elementCommands: 'element commands (`focus`, `scrollIntoView`, position reads)',
	keyedRead: 'reading a key chosen at run time (`map[key]`)',
	operators: 'more operators (`typeof`, `in`, `**`, `??=`, bitwise)',
	objectSpread: 'object spread (`{ ...a, b }`)',
	typeAssertions: 'type assertions (`x as T`), erased',
	framework: 'a Markless API call (router `navigate`, `flush`...)',
	device: 'a device call (`@markless/device`)',
	logging: '`console.*` (dropped or forwarded)',
} as const;
export type Extension = keyof typeof EXTENSIONS;

const STD_GLOBAL_ROOTS = new Set([
	'Math', 'JSON', 'Object', 'Array', 'Number', 'String', 'Boolean', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
	'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'structuredClone', 'Infinity', 'NaN',
	'undefined', 'Symbol', 'Error', 'TypeError', 'RangeError', 'Promise',
]);
const DATE_GLOBAL_ROOTS = new Set(['Date', 'Intl']);
const TIMER_GLOBALS = new Set([
	'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
	'queueMicrotask', 'requestIdleCallback',
]);
const PURE_METHODS = new Set([
	'filter', 'map', 'find', 'findIndex', 'some', 'every', 'includes', 'indexOf', 'join', 'concat', 'slice', 'reverse',
	'toReversed', 'toUpperCase', 'toLowerCase', 'trim', 'split', 'startsWith', 'endsWith', 'padStart', 'padEnd', 'replace',
	'replaceAll', 'charAt', 'charCodeAt', 'codePointAt', 'at', 'substring', 'substr', 'repeat', 'trimStart', 'trimEnd',
	'toFixed', 'toPrecision', 'toString', 'localeCompare', 'flat', 'flatMap', 'reduce', 'reduceRight', 'findLast',
	'findLastIndex', 'lastIndexOf', 'keys', 'values', 'entries', 'toSorted', 'toSpliced', 'with', 'forEach', 'has', 'get',
	'normalize', 'valueOf', 'then',
]);
const LOCALE_METHODS = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'toISOString', 'getTime', 'getFullYear', 'getMonth', 'getDate', 'getDay', 'getHours', 'getMinutes', 'getSeconds', 'setDate', 'setMonth', 'setFullYear', 'format']);
const MUTATING_METHODS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'fill', 'copyWithin', 'set', 'add', 'delete', 'clear']);
const EVENT_FLAGS = new Set(['preventDefault', 'stopPropagation', 'stopImmediatePropagation']);
const ELEMENT_COMMANDS = new Set([
	'focus', 'blur', 'scrollIntoView', 'scrollTo', 'scrollBy', 'select', 'click', 'showModal', 'show', 'close', 'showPopover',
	'hidePopover', 'togglePopover', 'getBoundingClientRect', 'setSelectionRange', 'requestFullscreen', 'setPointerCapture',
	'releasePointerCapture', 'hasPointerCapture', 'contains', 'reportValidity', 'checkValidity', 'setCustomValidity',
]);
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self']);
const ASSIGNMENTS = new Set(['=', '++', '--', '+=', '-=', '*=', '/=', '%=']);
const ERROR_CLASSES = new Set(['Error', 'TypeError', 'RangeError']);
const SUPPORTED_EVENTS = new Set(['click', 'input']);

/** Reads another module's function or `shared()` method as native facts; owned by the caller (file access). */
export type FunctionLoader = (
	from: string,
	specifier: string | null,
	name: string,
	member?: string,
) => { readonly file: string; readonly parameters: ReadonlyArray<string>; readonly body: ReadonlyArray<SemanticHandlerStatement> } | undefined;

type Context = {
	readonly file: string;
	readonly eventParameter: string | undefined;
	readonly depth: number;
	readonly load: FunctionLoader;
	readonly extensions: Set<Extension>;
	readonly reasons: Set<string>;
	readonly visiting: Set<string>;
};

const rootRead = (expression: SemanticExpression | undefined): Extract<SemanticExpression, { kind: 'read' }> | undefined => {
	if (!expression) return undefined;
	if (expression.kind === 'read') return expression;
	if (expression.kind === 'member') return rootRead(expression.object);
	if (expression.kind === 'unsupported' && expression.gap?.kind === 'type-assertion') return rootRead(expression.gap.value);
	if (expression.kind === 'unsupported' && expression.gap?.kind === 'computed-member') return rootRead(expression.gap.object);
	return undefined;
};

/** Classifies one event handler from the analyzer's native facts. */
export function classifyHandler(
	event: SemanticEvent,
	file: string,
	load: FunctionLoader,
): HandlerVerdict | undefined {
	if (!event.handlerStatements) return undefined;
	const context: Context = {
		file,
		eventParameter: event.handlerParameters[0],
		depth: 0,
		load,
		extensions: new Set(),
		reasons: new Set(),
		visiting: new Set(),
	};
	if (event.handlerParameters.length > 0 && !(event.eventName === 'input' && event.handlerParameters.length === 1))
		context.extensions.add('eventFields');
	statements(event.handlerStatements, context);
	return verdict(context, !SUPPORTED_EVENTS.has(event.eventName));
}

/** Classifies a function body reached some other way (a `shared()` method a handler names, a computed). */
export function classifyStatements(
	body: ReadonlyArray<SemanticHandlerStatement>,
	file: string,
	load: FunctionLoader,
): HandlerVerdict {
	const context: Context = { file, eventParameter: undefined, depth: 0, load, extensions: new Set(), reasons: new Set(), visiting: new Set() };
	statements(body, context);
	return verdict(context, false);
}

export function classifyExpression(value: SemanticExpression, file: string, load: FunctionLoader): HandlerVerdict {
	const context: Context = { file, eventParameter: undefined, depth: 0, load, extensions: new Set(), reasons: new Set(), visiting: new Set() };
	expression(value, context);
	return verdict(context, false);
}

/** The groups class 3 reasons are reported in. */
export const REASON_GROUPS = {
	browser: 'the page itself: DOM elements, `document`, `window`, browser classes and DOM type tests',
	timers: 'timers (`setTimeout`, `setInterval`, `requestAnimationFrame`)',
	closure: 'a function passed or kept as a value (a closure)',
	objects: 'values of unknown shape: class instances, your own classes, objects a library or another module hands back',
	regex: 'regular expressions',
	library: 'a third-party package',
	network: 'a network request (`fetch`)',
	recursion: 'a function the build cannot follow (recursive or deeply nested)',
	other: 'other syntax',
} as const;
export type ReasonGroup = keyof typeof REASON_GROUPS;

const reason = (context: Context, group: ReasonGroup, detail: string) => context.reasons.add(`${group}: ${detail}`);

const verdict = (context: Context, eventOutsideVocabulary: boolean): HandlerVerdict => ({
	class: context.reasons.size > 0 ? 3 : context.extensions.size > 0 ? 2 : 1,
	extensions: [...context.extensions].sort(),
	reasons: [...context.reasons].sort(),
	eventOutsideVocabulary,
});

function statements(list: ReadonlyArray<SemanticHandlerStatement>, context: Context): void {
	for (const statement of list) {
		if (statement.kind === 'assign') expression(statement.value, context);
		else if (statement.kind === 'invoke') invoke(statement.name, statement.origin, context);
		else if (statement.gap) gap(statement.gap, context);
		else reason(context, 'other', `unclassified: ${statement.construct}`);
	}
}

function invoke(name: string, origin: SemanticNameOrigin | undefined, context: Context): void {
	if (!origin || origin.kind === 'parameter') return;
	call({ kind: 'call', callee: name, origin, optional: false, arguments: [] }, context);
}

function expression(value: SemanticExpression, context: Context): void {
	switch (value.kind) {
		case 'read':
			if (value.global) globalRead(value.name, context);
			return;
		case 'literal':
			return;
		case 'unary':
			return expression(value.value, context);
		case 'binary':
		case 'logical':
			expression(value.left, context);
			return expression(value.right, context);
		case 'conditional':
			expression(value.test, context);
			expression(value.consequent, context);
			return expression(value.alternate, context);
		case 'template':
			for (const part of value.parts) if (typeof part !== 'string') expression(part, context);
			return;
		case 'member':
			if (context.eventParameter !== undefined && rootRead(value)?.name === context.eventParameter)
				context.extensions.add('eventFields');
			return expression(value.object, context);
		case 'call':
			for (const argument of value.arguments) expression(argument, context);
			return;
		case 'array':
			for (const item of value.items) expression(item.value, context);
			return;
		case 'object':
			for (const [, entry] of value.entries) expression(entry, context);
			return;
		case 'method':
			expression(value.object, context);
			for (const argument of value.arguments) expression(argument, context);
			return;
		case 'lambda':
			return expression(value.body, context);
		case 'unsupported':
			if (value.gap) gap(value.gap, context);
			else reason(context, 'other', `unclassified: ${value.construct}`);
	}
}

function globalRead(name: string, context: Context): void {
	if (STD_GLOBAL_ROOTS.has(name)) return;
	if (DATE_GLOBAL_ROOTS.has(name)) context.extensions.add('dates');
	else if (name === 'console') context.extensions.add('logging');
	else if (TIMER_GLOBALS.has(name)) reason(context, 'timers', 'timers (`setTimeout`, `requestAnimationFrame`)');
	else reason(context, 'browser', `a browser global (\`${name}\`)`);
}

function gap(value: SemanticNativeGap, context: Context): void {
	switch (value.kind) {
		case 'await':
			context.extensions.add('await');
			return expression(value.value, context);
		case 'async-function':
			context.extensions.add('await');
			return statements(value.body, context);
		case 'control-flow':
			context.extensions.add('control');
			for (const test of value.tests) expression(test, context);
			return statements(value.inner, context);
		case 'loop':
			context.extensions.add('loop');
			for (const test of value.tests) expression(test, context);
			return statements(value.inner, context);
		case 'local':
			context.extensions.add('locals');
			for (const item of value.values) expression(item, context);
			return;
		case 'call':
			return call(value, context);
		case 'new':
			if (value.origin?.kind === 'global' && value.callee && DATE_GLOBAL_ROOTS.has(value.callee.split('.')[0]!))
				context.extensions.add('dates');
			else if (value.origin?.kind === 'global' && value.callee && ERROR_CLASSES.has(value.callee))
				context.extensions.add('control');
			else if (value.origin?.kind === 'global')
				reason(context, 'browser', `a browser or built-in class (\`new ${value.callee ?? '...'}\`)`);
			else reason(context, 'objects', 'constructing your own or a library class (`new`)');
			return;
		case 'member-write': {
			const root = rootRead(value.object);
			expression(value.value, context);
			if (root?.global) return globalRead(root.name, context);
			if ((root && root.name === context.eventParameter) || (value.origin?.kind === 'variable' && variableHolds(value.origin, context).kind === 'dom')) {
				reason(context, 'browser', 'writing to a DOM element or event');
				return;
			}
			context.extensions.add('fieldWrite');
			return expression(value.object, context);
		}
		case 'computed-member':
			context.extensions.add('keyedRead');
			expression(value.object, context);
			return expression(value.key, context);
		case 'function-value':
			reason(context, 'closure', 'a function passed or kept as a value (closure)');
			return;
		case 'type-assertion':
			context.extensions.add('typeAssertions');
			return expression(value.value, context);
		case 'operator':
			if (ASSIGNMENTS.has(value.operator)) context.extensions.add('locals');
			else if (value.operator === 'instanceof') reason(context, 'browser', 'an `instanceof` test (DOM or class types)');
			else context.extensions.add('operators');
			for (const operand of value.operands) expression(operand, context);
			return;
		case 'other':
			if (value.nodeType === 'ObjectSpreadOrMethod') context.extensions.add('objectSpread');
			else if (value.nodeType === 'RegExpLiteral') reason(context, 'regex', 'a regular expression');
			else if (value.nodeType === 'UnusedValue') return;
			else reason(context, 'other', `\`${value.nodeType}\``);
	}
}

function follow(
	key: string,
	body: { readonly file: string; readonly body: ReadonlyArray<SemanticHandlerStatement> } | undefined,
	extension: Extension,
	context: Context,
): boolean {
	if (!body) return false;
	context.extensions.add(extension);
	if (context.visiting.has(key) || context.depth > 6) return true;
	context.visiting.add(key);
	statements(body.body, { ...context, file: body.file, eventParameter: undefined, depth: context.depth + 1 });
	context.visiting.delete(key);
	return true;
}

/** What a variable holds, from its declaration's value: a `shared()` instance, an element handle, state or other. */
function variableHolds(
	origin: Extract<SemanticNameOrigin, { kind: 'variable' }>,
	context: Context,
):
	| { kind: 'shared'; definition: string; specifier: string | null }
	| { kind: 'element' }
	| { kind: 'dom' }
	| { kind: 'state' }
	| { kind: 'regex' }
	| { kind: 'other' } {
	const init = origin.initializer;
	const initRoot = rootRead(init);
	if (initRoot && context.eventParameter !== undefined && initRoot.name === context.eventParameter) return { kind: 'dom' };
	if (initRoot?.global && !STD_GLOBAL_ROOTS.has(initRoot.name)) return { kind: 'dom' };
	if (init?.kind === 'unsupported' && init.gap?.kind === 'other' && init.gap.nodeType === 'RegExpLiteral') return { kind: 'regex' };
	const callGap = init?.kind === 'unsupported' && init.gap?.kind === 'call' ? init.gap : undefined;
	if (!callGap || !callGap.callee || callGap.object) return { kind: 'other' };
	const from = callGap.origin;
	if (from?.kind === 'import' && from.source === '@markless/core') {
		if (from.imported === 'element') return { kind: 'element' };
		if (from.imported === 'state' || from.imported === 'storage') return { kind: 'state' };
		return { kind: 'other' };
	}
	if (from?.kind === 'import' && from.source.startsWith('.'))
		return { kind: 'shared', definition: from.imported ?? callGap.callee, specifier: from.source };
	if (from?.kind === 'variable' && from.scope === 'module') {
		const inner = from.initializer;
		const sharedCall = inner?.kind === 'unsupported' && inner.gap?.kind === 'call' ? inner.gap : undefined;
		if (sharedCall?.origin?.kind === 'import' && sharedCall.origin.source === '@markless/core' && sharedCall.origin.imported === 'shared')
			return { kind: 'shared', definition: callGap.callee, specifier: null };
	}
	return { kind: 'other' };
}

function call(value: Extract<SemanticNativeGap, { kind: 'call' }>, context: Context): void {
	for (const argument of value.arguments) {
		if (argument.kind === 'lambda') expression(argument.body, context);
		else if (!(argument.kind === 'unsupported' && argument.gap?.kind === 'function-value')) expression(argument, context);
	}
	const passesFunction = value.arguments.some(
		(argument) => argument.kind === 'lambda' || (argument.kind === 'unsupported' && argument.gap?.kind === 'function-value'),
	);
	const origin = value.origin;
	const method = value.method;
	const root = (value.object && rootRead(value.object)?.name) ?? value.callee?.split('.')[0];
	const mark = (extension: Extension) => {
		context.extensions.add(extension);
		if (passesFunction && extension !== 'methods' && extension !== 'listEdit')
			reason(context, 'closure', 'a function passed or kept as a value (closure)');
	};
	if (value.object && origin?.kind !== 'global') expression(value.object, context);

	if (!origin) {
		if (value.object?.kind === 'unsupported' && value.object.gap?.kind === 'other' && value.object.gap.nodeType === 'RegExpLiteral') return;
		if (method && PURE_METHODS.has(method)) return mark('methods');
		if (method && MUTATING_METHODS.has(method)) return mark('listEdit');
		if (method && LOCALE_METHODS.has(method)) return mark('dates');
		if (method && ELEMENT_COMMANDS.has(method)) return mark('elementCommands');
		reason(context, 'objects', `a call through an expression (\`${method ?? 'computed'}\`)`);
		return;
	}
	switch (origin.kind) {
		case 'global': {
			if (root === 'console') return mark('logging');
			if (root === 'fetch') {
				reason(context, 'network', 'a network request (`fetch`)');
				return;
			}
			if ((root && TIMER_GLOBALS.has(root)) || (method && GLOBAL_OBJECTS.has(root ?? '') && TIMER_GLOBALS.has(method))) {
				reason(context, 'timers', 'timers (`setTimeout`, `requestAnimationFrame`)');
				return;
			}
			if (root && DATE_GLOBAL_ROOTS.has(root)) return mark('dates');
			if (root && STD_GLOBAL_ROOTS.has(root)) {
				if (method && MUTATING_METHODS.has(method)) return mark('listEdit');
				return mark('stdlib');
			}
			reason(context, 'browser', `a browser API (\`${value.callee ?? root}\`)`);
			return;
		}
		case 'import': {
			if (origin.source === '@markless/device') return mark('device');
			if (origin.source.startsWith('@markless/')) {
				if (method && PURE_METHODS.has(method)) return mark('methods');
				return mark('framework');
			}
			if (origin.source.startsWith('.')) {
				const name = origin.imported ?? root ?? '';
				const body = method ? context.load(context.file, origin.source, name, method) : context.load(context.file, origin.source, name);
				if (follow(`${origin.source}#${name}.${method ?? ''}`, body, method ? 'sharedMethod' : 'ownFunction', context)) {
					if (passesFunction) context.extensions.add('callbackArgs');
					return;
				}
				reason(context, 'objects', 'a call into an imported value whose body the build cannot see');
				return;
			}
			reason(context, 'library', `a third-party library (\`${origin.source}\`)`);
			return;
		}
		case 'parameter': {
			if (root !== undefined && root === context.eventParameter) {
				if (method && EVENT_FLAGS.has(method)) return mark('eventFlags');
				if (method && ELEMENT_COMMANDS.has(method)) return mark('elementCommands');
				context.extensions.add('eventFields');
				reason(context, 'browser', 'a DOM method on the event target (`closest`, `getAttribute`...)');
				return;
			}
			if (method && PURE_METHODS.has(method)) return mark('methods');
			if (method && MUTATING_METHODS.has(method)) return mark('listEdit');
			if (method && LOCALE_METHODS.has(method)) return mark('dates');
			if (method && ELEMENT_COMMANDS.has(method)) return mark('elementCommands');
			if (value.arguments.length > 0 || value.optional || method) context.extensions.add('callbackArgs');
			if (passesFunction) reason(context, 'closure', 'a function passed or kept as a value (closure)');
			return;
		}
		case 'function':
			if (origin.body) {
				follow(`${context.file}#${value.callee}`, { file: context.file, body: origin.body }, 'ownFunction', context);
				if (passesFunction) context.extensions.add('callbackArgs');
			} else reason(context, 'recursion', 'a function the build cannot follow (recursive or deeply nested)');
			return;
		case 'variable': {
			const holds = variableHolds(origin, context);
			if (holds.kind === 'dom' && !(method && ELEMENT_COMMANDS.has(method))) {
				reason(context, 'browser', 'a DOM method on the event target (`closest`, `getAttribute`...)');
				return;
			}
			if (holds.kind === 'regex') {
				reason(context, 'regex', 'a regular expression');
				return;
			}
			if (holds.kind === 'shared' && method) {
				const body = context.load(context.file, holds.specifier, holds.definition, method);
				if (follow(`${holds.specifier ?? context.file}#${holds.definition}.${method}`, body, 'sharedMethod', context)) return;
			}
			if (method && PURE_METHODS.has(method)) return mark('methods');
			if (method && MUTATING_METHODS.has(method)) return mark('listEdit');
			if (method && LOCALE_METHODS.has(method)) return mark('dates');
			if (method && ELEMENT_COMMANDS.has(method)) return mark('elementCommands');
			if (holds.kind === 'shared' || holds.kind === 'state') {
				// A function-valued field of shared state: a callback slot the widget root filled from a prop.
				context.extensions.add('callbackArgs');
				if (passesFunction) reason(context, 'closure', 'a function passed or kept as a value (closure)');
				return;
			}
			reason(context, 'objects', `a call on a value of unknown shape (\`${value.callee ?? method ?? '?'}\`)`);
			return;
		}
		case 'class':
			reason(context, 'objects', 'constructing your own or a library class (`new`)');
	}
}
