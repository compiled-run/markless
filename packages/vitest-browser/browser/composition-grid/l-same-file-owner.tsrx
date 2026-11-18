import { state } from '@markless/core';
import { LookupCard } from './lookup-card.tsrx';

// The arm's owner holds no value of its own: the page after it in this file hands it the page's.
export function SameFileArm({ topic, version }: { topic: string; version: number }) @{
	let showing = state(false);

	<section>
		@if (showing) {
			<LookupCard topic={topic} version={version} />
		} @else {
			<em data-g="closed">Hidden</em>
		}
		<button type="button" data-grid-close onClick={() => (showing = false)}>Hide</button>
		<button type="button" data-grid-open onClick={() => (showing = true)}>Show</button>
	</section>
}

export function SameFileOwnerPage() @{
	let topic = state('a');
	let version = state(0);

	<main>
		<SameFileArm topic={topic} version={version} />
		<button type="button" data-grid-subject onClick={() => (topic = topic === 'a' ? 'b' : 'a')}>Switch</button>
		<button type="button" data-grid-reload onClick={() => version++}>Again</button>
	</main>
}
