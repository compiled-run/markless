import { state } from '@markless/core';
import { PropArmOwner } from './owner.tsrx';

// The first owner sits in an outer arm the page can close and rebuild under the same instance path; the second never moves.
export default function RebuiltPage({ start }: { start: boolean }) @{
	let outer = state(true);
	let value = state(1);
	let list = state([1]);

	<main>
		<button type="button" data-outer onClick={() => (outer = !outer)}>Outer</button>
		<button type="button" data-bump onClick={() => ((value = value + 1), (list = [...list, value]))}>Bump</button>
		@if (outer) {
			<section data-moved>
				<PropArmOwner value={value} list={list} start={start} />
			</section>
		}
		<section data-still>
			<PropArmOwner value={value} list={list} />
		</section>
	</main>
}
