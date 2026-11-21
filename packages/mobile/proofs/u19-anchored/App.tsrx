import { state } from '@markless/core';

export default function App() @{
	let open = state(false);
	<main>
		<style>
			.bar {
				position: relative;
				height: 320px;
				anchor-scope: --details, --low;
			}
			.trigger {
				display: block;
				margin: 12px 0 0 40px;
				font-family: inherit;
				font-size: 18px;
				padding: 10px 18px;
				border: 2px solid #22223b;
				border-radius: 10px;
				background: #e9ecef;
				color: #22223b;
				anchor-name: --details;
			}
			.panel {
				position: absolute;
				position-anchor: --details;
				position-area: block-end;
				width: anchor-size(width);
				box-sizing: border-box;
				padding: 8px;
				border: 2px solid #8d99ae;
				background: #ffd166;
			}
			.hint {
				position: absolute;
				position-anchor: --details;
				position-area: inline-end;
				margin-left: 8px;
				padding: 4px 8px;
				background: #caf0f8;
			}
			.low {
				position: absolute;
				left: 40px;
				bottom: 16px;
				padding: 6px 12px;
				border: 2px solid #22223b;
				anchor-name: --low;
			}
			.above {
				position: absolute;
				position-anchor: --low;
				position-area: block-end span-inline-end;
				position-try-fallbacks: flip-block;
				height: 60px;
				padding: 6px;
				background: #ef476f;
				color: #ffffff;
			}
		</style>
		<h1>Anchored</h1>
		<div class="bar">
			<button class="trigger" onClick={() => (open = !open)}>Details</button>
			<div class="hint">Tap for details</div>
			<div class="panel" hidden={!open}>Ships in two days</div>
			<div class="low">Low anchor</div>
			<div class="above">Flipped above</div>
		</div>
		<p>Open {open ? 'yes' : 'no'}</p>
	</main>
}
