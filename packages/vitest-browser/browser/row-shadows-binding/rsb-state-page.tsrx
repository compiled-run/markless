import { state } from '@markless/core';
import { Label } from './rsb-label.tsrx';

export default function RowShadowsStatePage() @{
	let entry = state({ text: 'outer', done: true, tone: 'outer-tone', id: 99 });
	let picked = state('none');
	const entries = state([
		{ id: 1, text: 'a', done: false, tone: 'warm', parts: [{ id: 11, text: 'a1' }] },
		{ id: 2, text: 'b', done: true, tone: 'cool', parts: [{ id: 21, text: 'b1' }] },
	]);

	<section>
		<ul>
			@for (const entry of entries; key entry.id) {
				<li data-entry class={entry.tone}>
					<button data-pick type="button" onClick={() => (picked = entry.text)}>pick</button>
					<span data-text>{entry.text}</span>
					<span data-joined>{`${entry.text}!`}</span>
					<span>
						<Label text={entry.text} />
					</span>
					<div>
						@for (const part of entry.parts; key part.id) {
							<i data-part>{part.text}</i>
						}
					</div>
					@if (entry.done) {
						<b data-done>done</b>
					}
				</li>
			}
		</ul>
		<p data-outer class={entry.tone}>{entry.text}</p>
		<output data-picked>{picked}</output>
		<button data-rename type="button" onClick={() => (entry = { ...entry, text: 'renamed' })}>rename</button>
	</section>
}
