import { state } from '@markless/core';
import Wrap from './wrap.tsrx';

// The component in the arm is two levels down.
export default function DeepPanel() @{
	let open = state(false);

	<section>
		@if (open) {
			<Wrap />
		}
		<button data-open onClick={() => (open = !open)}>open</button>
	</section>
}
