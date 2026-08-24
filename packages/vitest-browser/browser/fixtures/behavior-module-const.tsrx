import { state } from '@markless/core';

// The declarations the behavior module has to carry. An attach behavior is
// fetched and evaluated as a module of its own in the browser, so every one of
// these has to be IN it: the server render reads them straight from this file
// and stays green either way, which is exactly why the gap stayed invisible
// until attach actually ran.
const LABEL = 'ready';
const PREFIX = 'state';

class Stamper {
	tone: string;

	constructor(tone: string) {
		this.tone = tone;
	}

	apply(element: Element): void {
		element.setAttribute('data-tone', this.tone);
	}
}

// Authored AFTER the class it constructs. A carry that emitted reachability
// order would put this first and run `new Stamper()` inside the class binding's
// temporal dead zone.
const stamper = new Stamper(LABEL);

// Each stamped host carries its own click as well as its attach: a resumed page
// runs a behavior when its host is woken, so the gesture the SSR lane needs has
// to land on the element being witnessed.
export function App() @{
	let taps = state(0);

	<section>
		<p
			data-plain
			attach={(element) => { element.setAttribute('data-state', LABEL); }}
			onClick={() => taps++}
		>
			plain
		</p>
		<p data-via-class attach={(element) => { stamper.apply(element); }} onClick={() => taps++}>
			class
		</p>
		<p
			data-labelled
			attach={(element) => { element.setAttribute('data-label', `${PREFIX}:${LABEL}`); }}
			onClick={() => taps++}
		>
			labelled
		</p>
		<output data-taps>{taps}</output>
	</section>
}
