// Hand-written fixes for the codes app authors hit most. Each one restates the
// diagnostic's own suggestion in plain words; `tooling/errors.ts` turns them into page data.
export type GuideSource = {
	readonly summary: string;
	readonly what: string;
	readonly how: string;
	readonly example?: readonly string[];
};

export const guides: Readonly<Record<string, GuideSource>> = {
	MARKLESS_ATTACH_NO_START_TRIGGER: {
		summary: 'Nothing on a server-rendered page starts this attach function.',
		what: 'On a page the server renders, `attach` waits until something on its element asks for code: an event handler on the element or inside it, or `onVisible` or `onIdle` on the element itself. This element has none of those, so the function never runs there.',
		how: 'Add `onVisible` to start it when the element scrolls into view, or `onIdle` to start it once the page is idle. If the element only ever renders in the browser, where `attach` runs as soon as the element exists, silence the warning with a reason.',
		example: [
			'<canvas',
			'\tattach={(canvas) => drawChart(canvas)}',
			'\tonVisible={() => {}}',
			'/>',
		],
	},
	MARKLESS_FRAMEWORK_IMPORT_REQUIRED: {
		summary: 'A .tsrx file calls state() or another Markless function without importing it.',
		what: 'In a `.tsrx` file, Markless treats `state`, `computed`, `element`, `shared`, and `storage` as its own names. This call uses one of those names, but the name does not come from an import of `@markless/core`.',
		how: 'If you meant the Markless function, import it. If you wrote your own helper with that name, rename the helper.',
		example: ["import { state } from '@markless/core';"],
	},
	MARKLESS_FRAMEWORK_API_RUNTIME_CALL: {
		summary: 'A Markless function like state() ran without Markless rewriting it first.',
		what: 'Functions like `state()` and `computed()` only work after Markless rewrites them while it builds your app. This call ran as plain JavaScript, so it threw.',
		how: 'Move the call into a `.tsrx` file. Do not call these functions from a plain `.ts` or `.js` file.',
	},
	MARKLESS_FRAMEWORK_API_ALIAS_UNSUPPORTED: {
		summary: 'A Markless function was copied into a variable or passed around as a value.',
		what: 'Markless only rewrites calls that use the imported name. A copy like `const make = state` gives it nothing to rewrite.',
		how: 'Call the imported function by its own name. If you want a reusable start value, wrap the value, not the function. Keep that helper at the top of the file.',
		example: [
			'const defaults = () => ({ open: false });',
			'',
			'export function Menu() @{',
			'\tconst menu = state(defaults());',
			'',
			"\t<button onClick={() => (menu.open = !menu.open)}>{menu.open ? 'Close' : 'Open'}</button>",
			'}',
		],
	},
	MARKLESS_STATE_MODULE_SCOPE: {
		summary: 'state() or computed() sits at the top of a file instead of inside a component.',
		what: 'A value at the top of a file belongs to every page that uses the file, not to one copy of the component. So Markless refuses `state()` and `computed()` there.',
		how: 'Move the call into the component body. If many components need the same value, use `shared()` instead.',
		example: [
			'export function Counter() @{',
			'\tlet count = state(0);',
			'',
			'\t<button onClick={() => count++}>{count}</button>',
			'}',
		],
	},
	MARKLESS_STATE_CREATION_SITE_UNSTABLE: {
		summary:
			'state() or computed() is created inside an @if, a loop, a handler, or another computed.',
		what: 'Each `state()` and `computed()` needs one fixed place in the component. This one sits inside a branch, a loop, an event handler, or another `computed()`.',
		how: 'Declare the value once, at the top level of the component body. Branch around the markup that uses it, not around the declaration. Write to it from the handler instead of creating it there.',
	},
	MARKLESS_STATE_STALE_LOCAL_WRITE: {
		summary:
			'An event handler writes a plain variable that the markup reads, so the page never changes.',
		what: 'A handler changes a plain `let`, and the markup shows that variable. The markup reads it only once, when the page first renders, so the click changes nothing on screen.',
		how: 'Wrap the value in `state()`. Then the page updates every time the handler writes it.',
		example: ['let count = state(0);', '', '<button onClick={() => count++}>{count}</button>'],
	},
	MARKLESS_STATE_WRITE_IN_COMPUTED: {
		summary: 'A computed() body writes to state.',
		what: 'A `computed()` reads values and returns a result. This one also writes to state, and that write wakes the same computed again.',
		how: 'Keep `computed()` free of writes. Move the write into an event handler.',
	},
	MARKLESS_STATE_WRITE_IN_TEMPLATE: {
		summary: 'An expression in the markup writes to state.',
		what: 'Expressions in markup only read values. This one also writes to state, and the write wakes the same expression again.',
		how: 'Render the value directly. Move the write into an event handler.',
	},
	MARKLESS_STATE_CONST_REASSIGNMENT: {
		summary: 'Code assigns a new value to state that was declared with const.',
		what: 'Markless keeps the normal JavaScript rules. A `const` binding can never get a new value, and `state()` does not change that.',
		how: 'Use `let` for state that you replace. A `const` object state still lets you change its properties, like `menu.open = true`.',
		example: ['let count = state(0);', 'const menu = state({ open: false });'],
	},
	MARKLESS_STATE_READ_ONLY_WRITE: {
		summary: 'Code writes to a computed() value or to a prop, and both are read-only.',
		what: 'You can only write to `state()`. A `computed()` value and a prop are read-only.',
		how: 'For a computed value, write to the state it reads from. For a prop, let the parent own the state, and pass down a handler that changes it.',
	},
	MARKLESS_STATE_NESTED_CREATION: {
		summary: 'state() gets another state() call as its start value.',
		what: 'The start value of `state()` must be plain data. Another `state()` call is not data.',
		how: 'Pass the plain start value.',
		example: ['const x = state(5);'],
	},
	MARKLESS_STATE_OPTIONAL_CHAIN_WRITE: {
		summary: 'Code writes to state through optional chaining, like a?.b = 1.',
		what: 'Optional chaining can skip a write when part of the path is missing. Markless needs every write to have a definite target.',
		how: 'Check the value with an `if` before you write. Or give the state a start value so the path always exists.',
	},
	MARKLESS_REPEAT_KEY_REQUIRED: {
		summary: 'An @for loop has no key.',
		what: 'Every `@for` inside an element needs a key, even one over a fixed list. Without a key, Markless cannot tell which row is which when the list changes.',
		how: 'Add a key that stays the same for each item, like an id. If state belongs to the position in the list, key by the index instead.',
		example: ['@for (const item of items; key item.id) {', '\t<li>{item.name}</li>', '}'],
	},
	MARKLESS_REPEAT_KEY_IS_INDEX: {
		summary:
			'An @for loop is keyed by its index, so row state follows the position and not the item.',
		what: 'This loop uses `key i`. If the list reorders, any row state and event wiring stay with the slot number, not with the item.',
		how: 'If items can move, key by a stable field like `item.id`. If state belongs to the slot, keep `key i` and silence the warning with a reason.',
		example: [
			'<ul>',
			'\t// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: the list never reorders',
			'\t@for (const item of items; index i; key i) {',
			'\t\t<li>{item}</li>',
			'\t}',
			'</ul>',
		],
	},
	MARKLESS_REPEAT_KEY_DUPLICATE: {
		summary: 'Two items in an @for list produced the same key.',
		what: 'Two rows in the list have the same key, so Markless cannot tell them apart.',
		how: 'Pick a key field that is unique across the whole list, like an id. Then check the data for repeated values.',
	},
	MARKLESS_ASYNC_BOUNDARY_REQUIRED: {
		summary: 'The markup reads an async computed() outside an @try block.',
		what: 'An async `computed()` can still be loading, or it can fail. The page needs to know what to show in both cases.',
		how: 'Put the read inside `@try`, with a `@pending` branch for loading and a `@catch` branch for failure.',
		example: [
			'@try {',
			'\t<p>{details.title}</p>',
			'} @pending {',
			'\t<p>Loading</p>',
			'} @catch {',
			'\t<p>Could not load</p>',
			'}',
		],
	},
	MARKLESS_ASYNC_POST_AWAIT_READ: {
		summary: 'An async computed() reads state after an await.',
		what: 'Markless records which state an async `computed()` reads before its first `await`. A read after the `await` is invisible to it.',
		how: 'Copy the value into a local before the first `await`. Use the local after it.',
		example: [
			'const details = computed(async ({ signal }) => {',
			'\tconst q = name;',
			'\treturn { title: await loadGreeting(q, signal) };',
			'});',
		],
	},
	MARKLESS_EVENT_HANDLER_EMIT_UNSUPPORTED: {
		summary: 'An event handler reads a local variable that does not exist in the browser.',
		what: 'The handler reads a local from the component body that Markless cannot carry to the browser. It holds a function, a class instance, a DOM node, or another value that is not plain data.',
		how: 'Move the function to the top of the file. Keep plain data in the local, or make it `state()`. For an element, use `element()`.',
	},
	MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION: {
		summary: 'An event prop like onClick gets a value instead of a function.',
		what: 'An event prop needs a function. This one gets the result of an expression, which runs once during render.',
		how: 'Wrap the expression in an arrow function.',
		example: ['<button onClick={() => count++}>Add</button>'],
	},
	MARKLESS_HANDLER_READS_RENDER_LOCAL: {
		summary:
			'An event handler reads a local from the component body that the browser cannot rebuild.',
		what: 'The handler reads a local from the component body. The body runs only for the first render, so the browser has no value for that local.',
		how: 'Build the local only from props, state, and imported values. Or move it to the top of the file. Or make it `state()`.',
	},
	MARKLESS_TEMPLATE_AS_VALUE: {
		summary: 'Markup is stored in a variable, in state, or in an array.',
		what: 'In Markless, markup is not a value. You cannot store it in a variable, in state, or in an array.',
		how: 'Keep markup in the component tree. Use `@if` and `@for` for conditional or repeated markup. Move reusable markup into a child component, or pass it as children.',
	},
	MARKLESS_COMPONENT_ROOT_CONDITIONAL: {
		summary: 'A component returns markup from more than one place.',
		what: 'A component needs one root. This one has a second place that returns markup.',
		how: 'Keep one root and put `@if` and `@else` inside it. For an early exit, `return null` before that root.',
	},
	MARKLESS_BRANCH_ELSE_SPELLING: {
		summary: 'An @if branch uses else without the @ sign.',
		what: 'Without the `@`, Markless does not see a branch. The page shows the word "else" and the code after it as text.',
		how: 'Write `@else`, with the `@` sign.',
		example: ['@if (open) {', '\t<p>Open</p>', '} @else {', '\t<p>Closed</p>', '}'],
	},
	MARKLESS_TRY_BLOCK_TOGGLE_RERENDER: {
		summary: 'Toggling an @if that holds a component re-renders the whole @try block.',
		what: 'This `@if` sits inside `@try` and holds a component. When it toggles, Markless renders the whole `@try` block again, not only the `@if`.',
		how: 'Move the component out of the `@if`. Or keep the `@if` content to plain elements, text, and state reads.',
	},
	MARKLESS_SHARED_FAMILY_SCOPE_IMPLICIT: {
		summary: 'Several components share a shared() definition that has no scope.',
		what: 'Several components in one file use the same `shared()` value, and it has no scope. So every copy of the widget on the page shares one value.',
		how: "Pass `{ scope: 'widget' }` to give each widget its own value. Pass `{ scope: 'page' }` if one value for the page is what you want.",
	},
	MARKLESS_SERIALIZE_UNSUPPORTED_VALUE: {
		summary: 'State holds a value that Markless cannot send from the server to the browser.',
		what: 'When a page is rendered on a server, Markless sends its state to the browser as data. This value is a function or a live object, so it cannot travel that way.',
		how: 'Keep plain data in state. Create live objects, like sockets, in an `attach={...}` behavior on an element. If the value comes from other state, use `computed()`.',
	},
	MARKLESS_COMPUTED_DEPENDENCY_CYCLE: {
		summary: 'A computed() value reads itself.',
		what: 'This `computed()` reads the value that it defines. There is no order in which Markless can work it out.',
		how: 'Read the value you meant to start from. If two values share a name by mistake, rename one.',
	},
	MARKLESS_COMPUTED_READ_CALLED: {
		summary: 'A computed() value is called like a function.',
		what: 'A `computed()` value is the value itself, not a function. Calling it throws a TypeError.',
		how: 'Drop the parentheses. Write `total`, not `total()`.',
	},
	MARKLESS_TEMPLATE_EXPRESSION_STATIC: {
		summary: 'A markup expression assigns a value, so its text never updates.',
		what: 'This expression in the markup assigns to a variable, like `{local = flag}`. Markless cannot keep that text current, so it shows its first value and never changes.',
		how: 'Move the logic into `computed()` and render the result.',
		example: [
			"const label = computed(() => (open ? 'Hide' : 'Show'));",
			'',
			'<button>{label}</button>',
		],
	},
	MARKLESS_PARSE_ERROR: {
		summary: 'Markless could not read a .tsrx file.',
		what: 'Markless could not read this file. The text after "reported:" names the problem.',
		how: 'Fix the syntax at the line in the message. The page on [reading a .tsrx file](/start/reading-tsrx) shows the rules.',
	},
	MARKLESS_ELEMENT_HANDLE_REQUIRED: {
		summary: 'The el prop gets something other than an element() handle.',
		what: 'The `el` prop only accepts a handle made with `element()`.',
		how: 'Create a handle with `element()`, then pass it to `el`.',
		example: ['const field = element<HTMLInputElement>();', '', '<input el={field} />'],
	},
	MARKLESS_ELEMENT_HANDLE_RENDER_READ: {
		summary: 'The markup reads an element() handle while the page renders.',
		what: 'An element does not exist yet while the page renders. So the markup cannot read an `element()` handle.',
		how: 'Read the element inside an event handler or an `attach` behavior. Show state values in the markup instead.',
	},
	MARKLESS_STORAGE_KEY_STATIC: {
		summary: 'storage() gets a key or fallback that is not a string literal.',
		what: 'Markless reads the `storage()` key and fallback when it builds your code. So both must be string literals.',
		how: "Pass string literals, like `storage('theme', 'light')`. Or leave out the key: `storage('light')`.",
	},
	MARKLESS_CHILDREN_OPAQUE: {
		summary: 'Code maps, counts, indexes, or changes children.',
		what: 'You can place `{children}`, wrap it, or pass it on. You cannot map, count, index, or change it.',
		how: 'Render `{children}` as it is. If you need markup per item, render the items in the parent.',
	},
	MARKLESS_ALLOW_REASON_REQUIRED: {
		summary: 'A markless-allow comment has no reason after the colon.',
		what: 'A `markless-allow` comment must say why you accept the warning.',
		how: 'Write the reason after the colon.',
		example: ['// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: the list never reorders'],
	},
	MARKLESS_ALLOW_ERROR_UNSUPPRESSIBLE: {
		summary: 'A markless-allow comment tries to silence an error.',
		what: '`markless-allow` silences warnings only. The code it names is an error.',
		how: 'Fix the error. Then delete the `markless-allow` comment.',
	},
	MARKLESS_ALLOW_STALE: {
		summary: 'A markless-allow comment names a code that no longer fires on that line.',
		what: 'The code named in this `markless-allow` comment does not fire on this line anymore.',
		how: 'Delete the `markless-allow` comment.',
	},
	MARKLESS_COMPILE_BLOCKED: {
		summary: 'A .tsrx file has errors, so the build stopped.',
		what: 'This line is a summary. The build found errors in one `.tsrx` file and stopped.',
		how: 'Read the blocks under this line. Each block starts with its own code, and each code has its own page.',
	},
	MARKLESS_SERVER_ONLY_PROP_BROWSER_READ: {
		summary: "Code that runs in the browser reads a page's http prop.",
		what: "A page's `http` prop holds the request, with its cookies and headers. It exists only while the page renders on the server. Here an event handler, an `attach`, a `computed()` the browser re-runs, or markup the browser rebuilds reads it. Whatever browser code reads is written into the page's HTML, so this would send the visitor's cookies and headers along with the page.",
		how: 'Read `http` in the page body, which runs only on the server. If the browser needs one value from it, copy that value into `state()` there.',
		example: [
			'export default function Search({ http }: PageProps) @{',
			"\tlet query = state(http.url.searchParams.get('q') ?? '');",
			'',
			'\t<button onClick={() => console.log(query)}>{query}</button>',
			'}',
		],
	},
	MARKLESS_ROUTER_RESPONSE_COMMITTED: {
		summary: 'A page changed its status or headers after the response started streaming.',
		what: 'The router sends the status and headers with the first bytes of the page. A page that waits on data keeps streaming after that. This write came later and tried to change what was already sent.',
		how: 'Set `http.response.status` and `http.response.headers` in the page body, before anything the page waits on. Writing the same value again is fine.',
	},
};
