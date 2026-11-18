import { state } from '@markless/core';
import { native, platform } from '@markless/device';

export default function Index() @{
	let browsing = state(false);
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
				background: #e9c46a;
				color: #264653;
				font-family: inherit;
				font-size: 18px;
			}
			.panel {
				display: flex;
				flex-direction: column;
				box-sizing: border-box;
				min-height: 100vh;
				padding: 16px;
				background: #f1faee;
			}
			.grid {
				display: flex;
				flex-wrap: wrap;
				gap: 8px;
			}
			.cell {
				box-sizing: border-box;
				width: calc(50% - 4px);
				padding: 12px;
				border-radius: 8px;
				background: #a8dadc;
				color: #1d3557;
				font-size: 16px;
			}
			.footer {
				margin-top: auto;
				padding: 12px;
				border-radius: 8px;
				background: #1d3557;
				color: #f1faee;
				font-size: 16px;
			}
		</style>
		<h1 class="title">Fruit</h1>
		<button class="open" onClick={() => (browsing = true)}>Browse fruit</button>
		@if (!platform.web) {
			<native.sheet open={browsing} onChange={(open) => (browsing = open)} snapPoints={[0.5, 1]}>
				<div class="panel">
					<div class="grid">
						<p class="cell">Apple</p>
						<p class="cell">Pear</p>
						<p class="cell">Plum</p>
						<p class="cell">Fig</p>
					</div>
					<p class="footer">Pinned to the bottom of the sheet</p>
				</div>
			</native.sheet>
		} @else {
			<p>On the web, the fruit open in a drawer</p>
		}
	</main>
}
