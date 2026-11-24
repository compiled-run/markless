import type { Children } from '@markless/core';
import { state } from '@markless/core';

export default function Shell({
	title,
	children,
}: {
	readonly title: string;
	readonly children?: Children;
}) @{
	let made = state(0);
	<>
		<style>
			.shell {
				min-height: 100vh;
				display: flex;
				flex-direction: column;
			}
			.bar {
				position: sticky;
				top: 0;
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 12px;
				padding: 12px 20px;
				border-bottom: 1px solid #e4ddd0;
				background: #fbf8f1;
			}
			.brand {
				font-size: 20px;
				font-weight: 600;
			}
			.pill {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				min-height: 44px;
				padding: 10px 18px;
				border: 1px solid #2f6f5e;
				border-radius: 999px;
				background: #2f6f5e;
				color: #ffffff;
				font: inherit;
				font-weight: 600;
			}
			.pill:active {
				transform: scale(0.97);
				opacity: 0.85;
			}
			.content {
				padding: 20px;
			}
		</style>
		<div class="shell">
			<title>{title}</title>
			<header class="bar">
				<span class="brand">Notes</span>
				<button type="button" class="pill" onClick={() => (made = made + 1)}>
					New note
				</button>
			</header>
			<main class="content">
				{children}
				<p class="made">Made {made}</p>
			</main>
		</div>
	</>
}
