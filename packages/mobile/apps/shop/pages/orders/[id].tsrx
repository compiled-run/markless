import { computed, storage } from '@markless/core';
import { Link, type PageProps } from '@markless/router';
import Shell from '../../lib/Shell.tsrx';
import { itemCount, money } from '../../lib/cart.ts';
import { loadOrder } from '../../lib/catalog.ts';

export default function OrderPage({ params }: PageProps<{ id: string }>) @{
	let cart = storage('cart', '[]');
	const order = computed(async () => loadOrder(params.id));

	<Shell count={itemCount(cart)} title={`Order ${params.id}`} tab="account">
		<style>
			.receipt {
				display: grid;
				gap: 12px;
				padding: 20px;
				border: 1px solid var(--line);
				border-radius: var(--radius);
				background: var(--card);
			}
			.receipt ul {
				margin: 0;
				padding: 0;
				list-style: none;
			}
			.receipt li {
				display: flex;
				justify-content: space-between;
				padding: 8px 0;
				border-bottom: 1px solid var(--line);
			}
		</style>
		@try {
			<section class="receipt">
				<h1>Order {order.id} placed</h1>
				<ul>
					@for (const line of order.lines; key line.key) {
						<li>
							<span>
								{line.quantity} × {line.name} ({line.option})
							</span>
							<span>{money(line.price * line.quantity)}</span>
						</li>
					}
				</ul>
				<p>
					Total <strong>{money(order.total)}</strong>
				</p>
				<Link href="/" class="button primary">
					Keep shopping
				</Link>
			</section>
		} @pending {
			<p>Loading your order…</p>
		} @catch (error) {
			<p class="problem" role="alert">{error.message}</p>
		}
	</Shell>
}
