import { computed, state } from '@markless/core';

export default function StopStreamPage() @{
	let order = state('');
	const shelf = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 60));
		return { title: 'Shelf ready' };
	});

	<section>
		@try {
			<div data-testid="shelf" onPointerDown={() => (order = order + 'shelf;')}>
				{shelf.title}
				<span
					data-testid="shelf-mark"
					onPointerDown={(event) => {
						event.stopPropagation();
						order = order + 'mark;';
					}}
				>
					x
				</span>
			</div>
		} @pending {
			<p data-testid="shelf-waiting">Loading shelf</p>
		}
		<output data-testid="order">{order}</output>
	</section>
}
