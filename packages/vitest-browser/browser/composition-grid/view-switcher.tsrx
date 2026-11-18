import { state } from '@markless/core';
import type { Board } from './grid-server.ts';
import { PickedNames } from './picked-names.tsrx';

export function ViewSwitcher({ roster }: { roster: Board }) @{
	let showing = state(false);

	<article>
		<button type="button" data-grid-close onClick={() => (showing = false)}>Hide</button>
		<h3 class={roster.parity} data-g="title">{roster.title}</h3>
		@if (showing) {
			<PickedNames roster={roster} />
		} @else {
			<em data-g="closed">Hidden</em>
		}
		<button type="button" data-grid-open onClick={() => (showing = true)}>Show</button>
	</article>
}
