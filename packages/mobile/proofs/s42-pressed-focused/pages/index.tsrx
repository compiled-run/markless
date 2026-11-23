import { state } from '@markless/core';

export default function Pressed() @{
	let presses = state(0);
	let agreed = state(false);
	<main class="page">
		<style>
			.page {
				padding: 24px;
			}
			h1 {
				font-size: 28px;
				font-weight: 400;
			}
			.press {
				width: 200px;
				padding: 12px 16px;
				border: 2px solid #2f6b4f;
				border-radius: 10px;
				background: #ffffff;
				color: #2f6b4f;
			}
			.press:active {
				background: #2f6b4f;
				color: #ffffff;
			}
			.row {
				display: flex;
				align-items: center;
				gap: 12px;
				margin-top: 24px;
			}
			.agree:focus {
				outline: 3px solid #c9a227;
				outline-offset: 2px;
			}
		</style>
		<title>Pressed</title>
		<h1>Pressed and focused</h1>
		<div class="press" onClick={() => presses++}>Press and hold</div>
		<p>{`Pressed ${presses}`}</p>
		<label class="row">
			<input type="checkbox" class="agree" checked={agreed} onChange={(event) => (agreed = event.currentTarget.checked)} />
			Agree
		</label>
		<p>{agreed ? 'Agreed' : 'Not agreed'}</p>
	</main>
}
