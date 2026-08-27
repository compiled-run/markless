import { element, state } from '@markless/core';

// A handler opens a `hidden`-bound surface and focuses it on the very next
// line. Nothing inside a hidden subtree can take focus, so this only lands if
// the write reached the DOM before the focus did.
export default function WriteThenFocusHiddenSurfacePage() @{
	let open = state(false);
	let sawCommitted = state('unread');
	const surfaceEl = element<HTMLDivElement>();

	<section data-write-then-focus="hidden">
		<button
			type="button"
			data-testid="open"
			onClick={() => {
				open = true;
				const surface = surfaceEl;
				sawCommitted = surface?.hasAttribute('hidden') === false ? 'committed' : 'deferred';
				surface?.focus();
			}}
		>open</button>
		<div data-testid="surface" tabindex={-1} el={surfaceEl} hidden={open !== true}>surface</div>
		<output data-testid="committed">{sawCommitted}</output>
	</section>
}
