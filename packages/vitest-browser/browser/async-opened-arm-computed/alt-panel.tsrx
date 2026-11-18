import { state } from '@markless/core';
import Filtered from './alt-filtered.tsrx';

export default function Panel(props: { names: Array<string> }) @{
	let shown = state(false);

	<article>
		@if (!shown) {
			<span>closed</span>
		} @else {
			<Filtered names={props.names} />
		}
		<button data-toggle onClick={() => (shown = !shown)}>toggle</button>
	</article>
}
