import { state } from '@markless/core';
import { Link } from '@markless/router';

export default function Orders() @{
	let orders = state([
		{ id: '7', name: 'Desk lamp' },
		{ id: '42', name: 'Oak chair' },
	]);
	<main>
		<title>Orders</title>
		<h1>Your orders</h1>
		<ul>
			@for (const order of orders; key order.id) {
				<li>
					<Link href="/orders/[id]" params={{ id: order.id }}>{order.name}</Link>
				</li>
			}
		</ul>
	</main>
}
