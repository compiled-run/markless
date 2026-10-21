import { state } from '@markless/core';
import { Counter } from './fragment-root-counter.tsrx';

function Layer() @{
	let open = state(false);

	<aside data-layer>
		<button type="button" data-layer-toggle onClick={() => (open = !open)}>Layer</button>
		<output data-layer-open>{open ? 'open' : 'closed'}</output>
	</aside>
}

function Pair() @{
	<>
		<span data-pair>pair</span>
		<Counter name="third" />
	</>
}

export default function FragmentRootPage() @{
	let shown = state(true);

	<>
		<main>
			<h1>Fragment root</h1>
			<Counter name="first" />
			<section><Pair /></section>
			<button type="button" data-note-toggle onClick={() => (shown = !shown)}>Note</button>
			@if (shown) { <p data-note>note</p> }
		</main>
		<Counter name="second" />
		<Layer />
	</>
}
