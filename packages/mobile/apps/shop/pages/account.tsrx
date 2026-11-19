import { computed, storage } from '@markless/core';
import { Link } from '@markless/router';
import Shell from '../lib/Shell.tsrx';
import { itemCount } from '../lib/cart.ts';

export default function Account() @{
	let orders = storage('orders', '');
	let cart = storage('cart', '[]');
	const ids = computed(() => (orders === '' ? [] : orders.split(',')));

	<Shell count={itemCount(cart)} title="Account" tab="account">
		<style>
			.profile {
				display: flex;
				align-items: center;
				gap: 14px;
				margin-bottom: 24px;
			}
			.avatar {
				display: grid;
				place-items: center;
				width: 56px;
				height: 56px;
				border-radius: 50%;
				background: var(--accent);
				color: var(--accent-ink);
				font-size: 22px;
				font-weight: 600;
			}
			.orders {
				display: grid;
				gap: 8px;
				margin: 0;
				padding: 0;
				list-style: none;
			}
			.order {
				display: block;
				padding: 14px 16px;
				border: 1px solid var(--line);
				border-radius: var(--radius);
				background: var(--card);
				text-decoration: none;
			}
			.none {
				color: var(--muted);
			}
		</style>
		<h1>Account</h1>
		<div class="profile">
			<span class="avatar" aria-hidden="true">G</span>
			<span>
				<strong>Guest shopper</strong>
				<br />
				Orders are kept on this device.
			</span>
		</div>
		<h2>Your orders</h2>
		<ul class="orders">
			@for (const id of ids; key id) {
				<li>
					<Link href="/orders/[id]" params={{ id }} class="order">
						Order {id}
					</Link>
				</li>
			}
		</ul>
		<p class="none" hidden={ids.length > 0}>
			No orders yet.
		</p>
	</Shell>
}
