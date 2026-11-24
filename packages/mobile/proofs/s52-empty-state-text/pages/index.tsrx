import { state } from '@markless/core';

export default function Locate() @{
	let problem = state('');
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #f8f9fa;
			}
			.note {
				margin: 0 0 12px;
				color: #212529;
				font-size: 16px;
			}
			.warning {
				margin: 0 0 12px;
				padding: 10px 14px;
				border-radius: 10px;
				background: #fde8e7;
				color: #b42318;
				font-size: 16px;
			}
			.locate {
				display: block;
				padding: 10px 16px;
				border: 0;
				border-radius: 10px;
				background: #264653;
				color: #ffffff;
				font: inherit;
				font-size: 16px;
			}
		</style>
		<p class="note">Where you are</p>
		<p class="warning">{problem}</p>
		<button type="button" class="locate" onClick={() => (problem = 'Location is off')}>Locate</button>
	</main>
}
