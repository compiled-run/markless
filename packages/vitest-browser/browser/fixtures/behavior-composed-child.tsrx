import { computed, state } from '@markless/core';

// The cross-module half of the composed-behavior witness. Same shape as the
// same-module `ComposedChild` in `behavior-composed.tsrx` - a LIVE graph-bound
// prop, a `computed()` over it, and an authored `attach=` behavior on the
// element - but compiled in a module of its own, so the page reaches it through
// an import rather than a local binding.
//
// That difference is the point: the composed-symbol wrapper the child's
// computed() installs, and the graph-less activation context CSR hands the
// behavior, both have to survive crossing a module boundary.
export function ImportedComposedChild({ label }) @{
	const data = state({ count: 0 });
	const shout = computed(() => `${label}!`);

	<button
		type="button"
		data-imported-part
		data-imported-label={label}
		data-imported-derived={shout}
		attach={(element) => {
			element.setAttribute('data-attached', 'imported');
		}}
		onClick={() => {
			data.count = data.count + 1;
		}}
	>{data.count}</button>
}
