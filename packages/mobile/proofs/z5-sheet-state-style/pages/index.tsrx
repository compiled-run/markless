import { state } from '@markless/core';
import { native, platform } from '@markless/device';

export default function Index() @{
	let choosing = state(false);
	let express = state(false);
	<main class="page">
		<style>
			.page {
				padding: 24px;
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
			.options {
				padding: 24px;
			}
			.toggle {
				display: block;
				width: 100%;
				padding: 14px 16px;
				border: 2px solid #264653;
				border-radius: 10px;
				background: #ffffff;
				color: #264653;
				font-family: inherit;
				font-size: 18px;
				text-align: left;
			}
			.toggle[ui-active] {
				background: #2a9d8f;
				border-color: #2a9d8f;
				color: #ffffff;
			}
		</style>
		<h1 class="title">Delivery</h1>
		<button class="open" onClick={() => (choosing = true)}>Delivery options</button>
		@if (!platform.web) {
			<native.sheet open={choosing} onChange={(open) => (choosing = open)}>
				<div class="options">
					<button class="toggle" ui-active={express} onClick={() => (express = !express)}>
						{express ? 'Express on' : 'Express off'}
					</button>
				</div>
			</native.sheet>
		} @else {
			<p>On the web, the options open in a drawer</p>
		}
	</main>
}
