import { state } from '@markless/core';

export default function ReorderRows() @{
	let order = state(['a', 'b', 'c', 'd', 'e']);
	<section>
		<button data-rotate onClick={() => (order = [...order.slice(1), order[0]!])}>
			rotate
		</button>
		<ol>
			@for (const name of order; key name) {
				<li tabindex="-1" data-name={name}>
					{name}
				</li>;
			}
		</ol>
	</section>;
}
