import { state } from '@markless/core';
import { native, platform } from '@markless/device';

export default function Index() @{
	let reading = state(false);
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #fdfcf9;
			}
			.title {
				font-size: 26px;
				font-weight: 700;
				color: #264653;
			}
			.open {
				display: block;
				margin-top: 16px;
				padding: 12px 20px;
				border: 2px solid #264653;
				border-radius: 12px;
				background: #ffffff;
				color: #264653;
				font-family: inherit;
				font-size: 18px;
			}
			.note {
				padding: 24px;
				background: #fdfcf9;
			}
			.heading {
				font-size: 24px;
				font-weight: 700;
				color: #264653;
			}
			.body {
				margin-top: 12px;
				padding: 12px 16px;
				border: 2px solid #264653;
				border-radius: 10px;
				color: #264653;
				font-size: 17px;
			}
			@media (prefers-color-scheme: dark) {
				.page,
				.note {
					background: #1d1b16;
				}
				.title,
				.heading {
					color: #f4f1ea;
				}
				.body {
					border-color: #e9c46a;
					color: #e9c46a;
				}
			}
		</style>
		<h1 class="title">Journal</h1>
		<button class="open" onClick={() => (reading = true)}>Read today</button>
		@if (!platform.web) {
			<native.sheet open={reading} onChange={(open) => (reading = open)}>
				<div class="note">
					<h2 class="heading">Today</h2>
					<p class="body">Walked by the river</p>
				</div>
			</native.sheet>
		} @else {
			<p>On the web, the entry opens in a drawer</p>
		}
	</main>
}
