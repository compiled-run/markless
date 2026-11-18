import { computed, state } from '@markless/core';
import { answer } from '../matched-values/gates.ts';

function OrderTable({ rows, onDelete }: { rows: readonly string[]; onDelete: (id: string) => void }) @{
	<ul data-orders>
		@for (const id of rows; key id) {
			<li data-row={id}>
				<button type="button" data-delete={id} onClick={() => onDelete(id)}>Delete {id}</button>
			</li>
		}
	</ul>
}

export function Orders() @{
	let reload = state(0);
	const orders = computed(async () => {
		const round = reload;
		return answer(`orders:${round}`, round === 0 ? ['a', 'b', 'c'] : ['a', 'c']);
	});

	<section>
		@try {
			<OrderTable
				rows={orders}
				onDelete={async (id) => {
					await answer(`remove:${id}`, true);
					reload = reload + 1;
				}}
			/>
		} @pending {
			<p data-pending>Loading</p>
		}
	</section>
}
