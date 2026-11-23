import { state } from '@markless/core';

export default function Notice() @{
	let closing = state(false);
	let shown = state(true);
	let ended = state('Notice open');
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #f8f9fa;
			}
			.heading {
				font-size: 26px;
				font-weight: 700;
				color: #212529;
			}
			.notice {
				margin-top: 16px;
				padding: 16px;
				border-radius: 10px;
				background: #fff3cd;
				color: #664d03;
				font-size: 17px;
			}
			.action {
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
			.status {
				margin-top: 24px;
				color: #495057;
				font-size: 15px;
			}
		</style>
		<title>Notice</title>
		<h1 class="heading">Notice</h1>
		@if (shown) {
			<div
				class="notice"
				ui-closing={closing}
				onAnimationEnd={(event) => {
					shown = false;
					ended = `Closed by ${event.animationName}`;
				}}
			>
				Your changes were saved
			</div>
		}
		<button class="action" onClick={() => (closing = true)}>
			Dismiss
		</button>
		<p class="status">{ended}</p>
	</main>
}
