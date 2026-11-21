import { state } from '@markless/core';

export default function Order() @{
	let open = state(false);
	let step = state(0);
	<main class="order">
		<style>
			.order {
				padding: 24px;
				background: #f8f9fa;
			}
			.heading {
				font-size: 26px;
				font-weight: 700;
				color: #212529;
			}
			.toggle,
			.advance {
				display: block;
				width: 100%;
				margin-top: 12px;
				padding: 10px 16px;
				border: 2px solid #264653;
				border-radius: 10px;
				background: #ffffff;
				color: #264653;
				font-family: inherit;
				font-size: 17px;
				text-align: left;
			}
			.details {
				margin-top: 16px;
				padding: 16px;
				border-radius: 12px;
				background: #264653;
				color: #ffffff;
			}
			.details .label {
				font-size: 14px;
				color: #a8dadc;
			}
			.details .value {
				margin-top: 4px;
				font-size: 22px;
				font-weight: 700;
			}
			.details .late {
				margin-top: 12px;
				padding: 8px 12px;
				background: #e76f51;
			}
			.hint {
				margin-top: 16px;
				color: #6c757d;
				font-size: 15px;
			}
			.badge {
				margin-top: 16px;
				padding: 12px 16px;
				border-radius: 999px;
				font-size: 18px;
			}
			.packed {
				background: #e9c46a;
				color: #212529;
			}
			.shipped {
				padding: 20px 16px;
				background: #2a9d8f;
				color: #ffffff;
			}
			.footer {
				margin-top: 24px;
				padding-top: 12px;
				border-top: 1px solid #adb5bd;
				color: #495057;
				font-size: 15px;
			}
		</style>
		<title>Order</title>
		<h1 class="heading">Order 1024</h1>
		<button class="toggle" onClick={() => (open = !open)}>
			Toggle details
		</button>
		@if (open) {
			<section class="details">
				<p class="label">Shipping</p>
				<p class="value">Two days</p>
				@if (step === 2) {
					<p class="late">Running late</p>
				}
			</section>
		} @else {
			<p class="hint">Details are hidden</p>
		}
		<button class="advance" onClick={() => (step = (step + 1) % 3)}>
			Next step
		</button>
		@if (step === 0) {
			<p class="badge packed">Packed</p>
		} @else if (step === 1) {
			<p class="badge shipped">Shipped</p>
		}
		<footer class="footer">Thanks for ordering</footer>
	</main>
}
