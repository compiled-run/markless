import { state } from '@markless/core';

export default function App() @{
	let pressed = state(true);
	let taps = state(0);
	<div class="shell">
		<style>
			.bar {
				position: sticky;
				top: 0;
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 12px;
				padding: 12px 20px;
				border-bottom: 1px solid #e4ddcf;
				background: #fbf8f1;
			}
			.links { display: flex; gap: 8px; }
			.link { padding: 8px 12px; border-radius: 999px; color: #6b645a; }
			.button {
				display: flex;
				align-items: center;
				padding: 10px 18px;
				border: 1px solid #c2410c;
				border-radius: 999px;
				background: #c2410c;
				color: #ffffff;
				font-weight: 600;
				font-family: inherit;
				font-size: 16px;
				text-decoration: none;
			}
			.button.pressed { transform: scale(0.97); opacity: 0.85; }
			.button.live:active { transform: scale(0.97); opacity: 0.85; }
			.content { padding: 20px; }
			.card { display: flex; gap: 8px; padding: 16px; border: 1px solid #e4ddcf; border-radius: 12px; background: #ffffff; }
			.toggle {
				display: block;
				width: 100%;
				margin-bottom: 16px;
				padding: 10px 16px;
				border: 2px solid #264653;
				border-radius: 10px;
				background: #ffffff;
				color: #264653;
				font-family: inherit;
				font-size: 16px;
			}
		</style>
		<title>See-through</title>
		<header class="bar">
			<span>Notes</span>
			<nav class="links">
				<span class="link">Tags</span>
				<a class={pressed ? 'button pressed' : 'button'} href="/">New note</a>
			</nav>
		</header>
		<main class="content">
			<p>Body text before the card</p>
			<a class="button" href="/">Plain pill</a>
			<p>Pill taps {taps}</p>
			<div class="card">
				<button class="button live" onClick={() => (taps = taps + 1)}>Tap the pill</button>
			</div>
			<button class="toggle" onClick={() => (pressed = !pressed)}>{pressed ? 'Release' : 'Press'}</button>
			<div class="card">
				<button class={pressed ? 'button pressed' : 'button'}>Edit note</button>
			</div>
		</main>
	</div>
}
