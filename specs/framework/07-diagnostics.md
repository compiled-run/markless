# Diagnostics

Compiler and runtime diagnostic contract for humans, editors, tests, and AI agents.

## Diagnostic System

Diagnostics are a first-class framework surface, not polish. The compiler and
runtime must explain mistakes in terms junior developers and AI agents can act
on without reverse-engineering the framework. Every important error should answer
four questions:

1. What happened?
2. Why is it invalid in this framework?
3. What should change?
4. Where can I read more?

All diagnostics use one structured shape across compiler and runtime:

```ts
type Diagnostic = {
	code: string; // stable, e.g. "ARCADE_CAPTURE_UNSUPPORTED_VALUE"
	severity: 'error' | 'warning' | 'info';
	phase:
		| 'parse'
		| 'semantic-graph'
		| 'state-lowering'
		| 'capture-analysis'
		| 'sync-policy'
		| 'serialization'
		| 'payload'
		| 'resume'
		| 'runtime';
	title: string;
	message: string;
	why: string;
	primarySpan?: SourceSpan;
	secondarySpans?: LabeledSpan[];
	passId?: string;
	artifactKeys?: string[];
	statePath?: string;
	symbolId?: string;
	elementLocator?: string;
	suggestions: Suggestion[];
	docsUrl: string;
};
```

Human output must be consistent: stable code, short title, source location,
code frame, explanation, and concrete fix. When the compiler can safely suggest
a rewrite, it should include before/after text or an autofix range. When it
cannot safely rewrite, it still gives a precise migration path.

Example shape:

```txt
ARCADE_CAPTURE_UNSUPPORTED_VALUE: Cannot capture local DOM node in lazy symbol

src/Menu.tsrx:13:27
  12 | const menuEl = document.querySelector("#menu");
  13 | <button onClick={() => menuEl.focus()} />
                              ^^^^^^ captured here

Why:
  Lazy handlers run after resume. A live DOM node cannot be serialized into
  arcade/state or recovered from a JavaScript closure.

Fix:
  Use element() plus el={...}, then read the element handle inside the handler.

Before:
  const menuEl = document.querySelector("#menu");

After:
  const menu = element<HTMLElement>();
  <div el={menu} />
```

Machine output must be available as JSON for editor integrations, tests, and AI
agents. JSON diagnostics include stable `code`, exact spans, `phase`, `passId`,
`artifactKeys`, and structured suggestions. Human wording may improve over time;
codes and machine fields are compatibility surface.

Diagnostic documentation follows the stable code:

```txt
https://arcadejs.com/errors/ARCADE_CAPTURE_UNSUPPORTED_VALUE
```

Runtime diagnostics must link back to compiler artifacts whenever possible. A
resume failure should name the symbol ID, source span, payload script, expected
build/protocol hash, and actual resolver/runtime hash. A serialization failure
should include the state path and value kind. A behavior failure should include
the host locator and behavior symbol. This makes runtime errors actionable
without requiring users to inspect compact payload encoding.

Required compile-time diagnostics include capture-rule violations,
bare `state()`/`computed()`/`shared()`/`element()` calls that are not imported
from `arcade`, framework APIs used outside a `.tsrx` reactive scope,
reactive reads after `await` in async computed bodies, async reads outside an
async boundary, `el` used with a non-`element()` handle, one `element()` handle
bound to multiple live host elements, an element handle stored in `state()` or
serialized data, unserializable initial state, and unextractable sync event
policy for `preventDefault()` / `stopPropagation()`.

Runtime dev diagnostics fail loudly with the same structured shape.
Serialization failures during initial render include state path and value kind.
Async result serialization failures include async computed ID and dependency
key. Resumer errors include symbol ID, graph reference, payload script, and
version/hash mismatch details.

Runtime production errors may minimize human text, but they still preserve the
stable code, docs URL, and structured metadata for the app-level error hook.
Symbol load failures retry once, then surface through that hook.
