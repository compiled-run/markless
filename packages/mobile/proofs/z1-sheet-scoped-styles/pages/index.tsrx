import { state } from '@markless/core';
import { native, platform } from '@markless/device';

export default function Index() @{
	let picking = state(false);
	let city = state('nowhere yet');
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #f4f1ea;
			}
			.title {
				font-size: 26px;
				font-weight: 700;
				color: #1d1b16;
			}
			.open {
				display: block;
				margin-top: 16px;
				padding: 12px 20px;
				border: 2px solid #1d1b16;
				border-radius: 12px;
				background: #ffd166;
				color: #1d1b16;
				font-family: inherit;
				font-size: 18px;
			}
			.picker {
				padding: 24px;
				background: #e9f5f2;
			}
			.heading {
				font-size: 24px;
				font-weight: 700;
				color: #1b4332;
			}
			.city {
				display: block;
				width: 100%;
				margin-top: 12px;
				padding: 14px 16px;
				border: 2px solid #1b4332;
				border-radius: 10px;
				background: #ffffff;
				color: #1b4332;
				font-family: inherit;
				font-size: 18px;
				text-align: left;
			}
		</style>
		<h1 class="title">Ship to {city}</h1>
		<button class="open" onClick={() => (picking = true)}>Choose city</button>
		@if (!platform.web) {
			<native.sheet open={picking} onChange={(open) => (picking = open)}>
				<div class="picker">
					<h2 class="heading">Choose a city</h2>
					<button
						class="city"
						onClick={() => {
							city = 'Osaka';
							picking = false;
						}}
					>
						Osaka
					</button>
					<button
						class="city"
						onClick={() => {
							city = 'Porto';
							picking = false;
						}}
					>
						Porto
					</button>
				</div>
			</native.sheet>
		} @else {
			<p class="heading">On the web, the cities open in a drawer</p>
		}
	</main>
}
