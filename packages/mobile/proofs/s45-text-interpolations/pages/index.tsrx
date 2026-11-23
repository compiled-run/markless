import { state } from '@markless/core';

export default function Taps() @{
	let header = state(0);
	let button = state(0);
	let picked = state('none');
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #f8f9fa;
			}
			.header {
				margin: 0;
				padding: 12px 16px;
				border-radius: 10px;
				background: #264653;
				color: #ffffff;
				font-size: 22px;
				font-weight: 700;
			}
			.tally {
				margin-top: 16px;
				padding: 12px 16px;
				border: 1px solid #ced4da;
				border-radius: 10px;
				background: #ffffff;
				color: #212529;
				font-size: 16px;
			}
			.count {
				color: #2a9d8f;
				font-weight: 700;
			}
			.button {
				display: block;
				margin-top: 12px;
				padding: 10px 16px;
				border: 1px solid #ced4da;
				border-radius: 10px;
				background: #ffffff;
				color: #212529;
				font-family: inherit;
				font-size: 17px;
			}
		</style>
		<h1 class="header" onClick={() => (header = header + 1)}>Tally</h1>
		<p class="tally">
			<span>Header taps {header} · Button taps {button} · Picked {picked}</span>
		</p>
		<p class="tally">
			<span class="count">{button}</span>
		</p>
		<p class="tally">
			Button total: <span class="count">{button} by button</span> so far
		</p>
		<p class="tally">
			Picked{' '}
			<span class="count">
				{picked}, the colour the last tap on Pick red chose for the rest of this page and every row
			</span>{' '}
			until it changes
		</p>
		<button class="button" onClick={() => (button = button + 1)}>Tap button</button>
		<button class="button" onClick={() => (picked = 'red')}>Pick red</button>
	</main>
}
