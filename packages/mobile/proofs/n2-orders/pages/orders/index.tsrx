import { state } from '@markless/core';
import { Link } from '@markless/router';

export default function Orders() @{
	let orders = state([
		{ id: '7', name: 'Desk lamp' },
		{ id: '42', name: 'Oak chair' },
		{ id: '108', name: 'Wool rug' },
	]);
	<main>
		<title>Orders</title>
		<h1>Your orders</h1>
		<button onClick={() => (orders = [...orders].reverse())}>Reverse order</button>
		<ul>
			@for (const order of orders; key order.id) {
				<li>
					<Link href="/orders/[id]" params={{ id: order.id }}>{order.name}</Link>
				</li>
			}
		</ul>
	</main>
}
