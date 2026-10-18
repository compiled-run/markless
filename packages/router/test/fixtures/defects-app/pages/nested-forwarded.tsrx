import { state } from '@markless/core';
import { Details } from '../src/details.tsrx';
import type { Field } from '../src/deep/parity/json-view.tsrx';

export default function NestedForwardedPage() @{
	let fields = state<Field[]>([{ name: 'a', items: ['a1'] }]);
	let direction = state('right');
	<main>
		<button
			type="button"
			data-fill
			onClick={() =>
				(fields = [
					{ name: 'b', items: ['b1', 'b2'] },
					{ name: 'c', items: ['c1'] },
				])
			}
		>
			fill
		</button>
		<button
			type="button"
			data-dock-toggle
			onClick={() => (direction = direction === 'right' ? 'bottom' : 'right')}
		>
			dock
		</button>
		<Details fields={fields} direction={direction} />
	</main>;
}
