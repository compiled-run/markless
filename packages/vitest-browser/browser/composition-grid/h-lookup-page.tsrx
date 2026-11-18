import { state } from '@markless/core';
import { LookupCard } from './lookup-card.tsrx';

export default function LookupPage() @{
	let showing = state(true);
	let topic = state('a');
	let version = state(0);

	<main>
		@if (!showing) {
			<em data-g="closed">Hidden</em>
		} @else {
			<LookupCard topic={topic} version={version} />
		}
		<button type="button" data-grid-close onClick={() => (showing = false)}>Hide</button>
		<button type="button" data-grid-open onClick={() => (showing = true)}>Show</button>
		<button type="button" data-grid-subject onClick={() => (topic = topic === 'a' ? 'b' : 'a')}>Switch</button>
		<button type="button" data-grid-reload onClick={() => version++}>Again</button>
	</main>
}
