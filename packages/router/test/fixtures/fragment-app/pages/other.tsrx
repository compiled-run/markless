import { state, storage } from '@markless/core';
import Nav from '../src/nav.tsrx';
import { session } from '../src/session.tsrx';

let theme = storage('fragment-theme', 'light');

export default function Other() @{
	let taps = state(0);
	const visit = session();

	<main data-page="other" class="other">
		<title>Other page</title>
		<style>
			.other .mark { color: rgb(200, 100, 50); }
		</style>
		<Nav />
		<p class="mark" data-mark>other</p>
		<output data-taps>{taps}</output>
		<button type="button" data-tap onClick={() => taps++}>Tap</button>
		<output data-theme>{theme}</output>
		<output data-hits>{visit.hits}</output>
		<button type="button" data-hit onClick={() => visit.hits++}>Hit</button>
		<a href="/" data-plain-home>Plain home</a>
		<a href="/nowhere" data-plain-unknown>Plain unknown</a>
	</main>
}
