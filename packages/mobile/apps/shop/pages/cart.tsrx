import { computed, state, storage } from '@markless/core';
import { Link, navigate } from '@markless/router';
import Shell from '../lib/Shell.tsrx';
import { changeQuantity, itemCount, money, parseCart, total } from '../lib/cart.ts';
import { sendOrder } from '../lib/catalog.ts';

export default function Cart() @{
	let cart = storage('cart', '[]');
	let orders = storage('orders', '');
	let problem = state('');
	const lines = computed(() => parseCart(cart));

	<Shell count={itemCount(cart)} title="Cart" tab="cart">
		<style>
			.empty {
				display: grid;
				justify-items: center;
				gap: 12px;
				padding: 48px 0;
				color: var(--muted);
			}
			.lines {
				display: grid;
				gap: 10px;
				margin: 0 0 18px;
				padding: 0;
				list-style: none;
			}
			.line {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 12px;
				padding: 14px 16px;
				border: 1px solid var(--line);
				border-radius: var(--radius);
				background: var(--card);
			}
			.what {
				display: grid;
			}
			.what span {
				color: var(--muted);
				font-size: 14px;
			}
			.quantity {
				display: flex;
				align-items: center;
				gap: 10px;
			}
			.step {
				width: 40px;
				height: 40px;
				border: 1px solid var(--line);
				border-radius: 50%;
				background: var(--paper);
			}
			.step:active {
				background: var(--line);
			}
			.total {
				display: flex;
				justify-content: space-between;
				font-size: 18px;
			}
			.checkout {
				width: 100%;
			}
		</style>
		<h1>Cart</h1>
		@if (lines.length === 0) {
			<section class="empty">
				<p>Your cart is empty.</p>
				<Link href="/" class="button primary">
					Browse the shop
				</Link>
			</section>
		} @else {
			<>
				<ul class="lines">
					@for (const line of lines; key line.key) {
						<li class="line">
							<span class="what">
								<strong>{line.name}</strong>
								<span>
									{line.option} · {money(line.price)}
								</span>
							</span>
							<span class="quantity">
								<button
									type="button"
									class="step"
									aria-label={`One fewer ${line.name}`}
									onClick={() => (cart = changeQuantity(cart, line.key, -1))}
								>
									−
								</button>
								<span aria-label="Quantity">{line.quantity}</span>
								<button
									type="button"
									class="step"
									aria-label={`One more ${line.name}`}
									onClick={() => (cart = changeQuantity(cart, line.key, 1))}
								>
									+
								</button>
							</span>
						</li>
					}
				</ul>
				<p class="total">
					Total <strong>{money(total(cart))}</strong>
				</p>
				<p class="problem" role="alert" hidden={problem === ''}>
					{problem}
				</p>
				<button
					type="button"
					class="button primary checkout"
					onClick={async () => {
						try {
							const order = await sendOrder(lines);
							orders = orders === '' ? order.id : `${order.id},${orders}`;
							cart = '[]';
							// storage() saves its cookie a task later, and the next page renders on the server from that cookie.
							await new Promise((done) => setTimeout(done));
							await navigate(`/orders/${order.id}`);
						} catch (error) {
							problem = (error as Error).message;
						}
					}}
				>
					Place order
				</button>
			</>
		}
	</Shell>
}
