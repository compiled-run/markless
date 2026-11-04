import { computed, state } from '@markless/core';

function Count({ total }: { total: number }) @{
	<strong data-total>{total}</strong>
}

export function InventoryPanel() @{
	let shelf = state('north');
	let compact = state(false);
	const stock = computed(async () => {
		const at = shelf;
		await new Promise((resolve) => setTimeout(resolve, at === 'north' ? 10 : 700));
		return {
			label: 'Shelf ' + at,
			total: at === 'north' ? 2 : 1,
			items: at === 'north' ? [{ sku: 'p' }, { sku: 'q' }] : [{ sku: 'r' }],
		};
	});
	const caption = computed(() => stock.label + ' stock');

	<main>
		<button type="button" data-shelf onClick={() => (shelf = 'south')}>South</button>
		<section data-panel>
			@try {
				<>
					<label data-compact>
						<input type="checkbox" checked={compact} onChange={() => (compact = !compact)} />
						Compact
					</label>
					<h3 data-caption>{caption}</h3>
					<Count total={stock.total} />
					<ul data-items>
						@for (const item of stock.items; key item.sku) {
							<li>{item.sku}</li>
						}
					</ul>
					<p data-static>Counted daily</p>
				</>
			} @pending {
				<p data-pending>Counting</p>
			} @catch {
				<p data-failed>Count failed</p>
			}
		</section>
	</main>
}
