import { state } from '@markless/core';

export default function StickyTap() @{
	let headerTaps = state(0);
	let buttonTaps = state(0);
	let picked = state('none');
	<main class="page">
		<style>
			.page {
				background: #f8f9fa;
			}
			.bar {
				position: sticky;
				top: 0;
				box-sizing: border-box;
				height: 150px;
				padding: 10px 16px;
				background: #264653;
				color: #ffffff;
				font-size: 15px;
			}
			.title {
				display: block;
				font-size: 20px;
				font-weight: 700;
			}
			.count {
				margin: 2px 0 0;
			}
			.add {
				display: block;
				margin-top: 6px;
				padding: 6px 12px;
				border: 2px solid #ffffff;
				border-radius: 8px;
				background: #2a9d8f;
				color: #ffffff;
				font-family: inherit;
				font-size: 15px;
			}
			.rows {
				padding: 0 16px 24px;
			}
			.row {
				display: block;
				width: 100%;
				height: 48px;
				margin-top: 8px;
				border: 1px solid #ced4da;
				border-radius: 10px;
				background: #ffffff;
				color: #212529;
				font-family: inherit;
				font-size: 17px;
				text-align: left;
			}
		</style>
		<title>Sticky tap</title>
		<header class="bar" aria-label="Sticky header" onClick={() => (headerTaps = headerTaps + 1)}>
			<span class="title">Sticky header</span>
			<p class="count">{`Header taps ${headerTaps}`}</p>
			<p class="count">{`Button taps ${buttonTaps}`}</p>
			<p class="count">{`Picked ${picked}`}</p>
			<button class="add" onClick={() => (buttonTaps = buttonTaps + 1)}>
				Header button
			</button>
		</header>
		<div class="rows">
			@for (const n of Array.from({ length: 30 }, (_, at) => at + 1); key n) {
				<button class="row" onClick={() => (picked = `Row ${n}`)}>
					Row {n}
				</button>
			}
		</div>
	</main>
}
