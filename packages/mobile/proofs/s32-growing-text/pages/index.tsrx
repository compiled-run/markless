import { state } from '@markless/core';

export default function App() @{
	let tag = state('Home');
	<main>
		<style>
			main { padding: 16px; }
			.tag { margin: 0; padding: 8px; background: #eef; font-size: 18px; }
			.after { margin: 8px 0 0; color: #555; }
			.grow {
				display: block;
				width: 100%;
				margin-top: 12px;
				padding: 10px 16px;
				border: 2px solid #264653;
				border-radius: 10px;
				background: #ffffff;
				color: #264653;
				font-family: inherit;
				font-size: 16px;
			}
		</style>
		<title>Growing text</title>
		<h1>Growing text</h1>
		<p class="tag">Tagged {tag}</p>
		<p class="after">Below the tag</p>
		<button class="grow" onClick={() => (tag = `${tag} and the garden shed out back`)}>Grow tag</button>
	</main>
}
