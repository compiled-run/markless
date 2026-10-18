import { computed, state } from '@markless/core';

export default function AppendRows() @{
	let count = state(5);
	const rows = computed(() => Array.from({ length: count }, (_, i) => i));
	<main>
		<button data-more onClick={() => (count += 2)}>
			more
		</button>
		<ul>
			@for (const i of rows; key i) {
				<li tabindex="0" data-row={i}>
					row {i}
				</li>;
			}
		</ul>
	</main>;
}
