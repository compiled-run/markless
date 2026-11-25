import { state } from '@markless/core';
import { modal } from '@markless/ui';

export default function ManyStates() @{
	let found = state(true);
	let confirming = state(false);
	let deleted = state(0);

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
				border-bottom: 1px solid var(--line);
				background: var(--paper);
			}
			.brand {
				font-size: 20px;
				font-weight: 600;
			}
			.links {
				display: flex;
				gap: 8px;
			}
			.link {
				padding: 8px 12px;
				border: 0;
				border-radius: 999px;
				background: transparent;
				color: var(--muted);
			}
			.link:active {
				background: var(--line);
			}
			.content {
				width: 100%;
				max-width: 880px;
				margin: 0 auto;
				padding: 20px;
			}
			@media (min-width: 700px) {
				.content {
					padding: 32px 40px;
				}
			}
			.note {
				display: grid;
				gap: 16px;
				padding: 24px;
				border: 1px solid var(--line);
				border-radius: var(--radius);
				background: var(--card);
				box-shadow: var(--shadow);
			}
			.meta {
				color: var(--muted);
				font-size: 14px;
			}
			.body p {
				margin: 0 0 12px;
			}
			.actions {
				display: flex;
				flex-wrap: wrap;
				gap: 10px;
			}
			.backdrop:not([hidden]) {
				display: grid;
				place-items: center;
				padding: 20px;
				background: rgb(0 0 0 / 0.45);
			}
			.dialog {
				display: grid;
				gap: 12px;
				width: min(420px, 100%);
				padding: 24px;
				border-radius: var(--radius);
				background: var(--card);
			}
			.dialog-title {
				margin: 0;
				font-size: 20px;
				font-weight: 600;
			}
			.dialog-actions {
				display: flex;
				justify-content: flex-end;
				gap: 10px;
			}
			.missing {
				display: grid;
				justify-items: center;
				padding: 48px 0;
				text-align: center;
			}
		</style>
		<div class="shell">
			<title>Many states</title>
			<header class="bar">
				<button type="button" class="link brand">
					Notes
				</button>
				<nav class="links" aria-label="Sections">
					<button type="button" class="link">
						Tags
					</button>
					<button type="button" class="button primary">
						New note
					</button>
				</nav>
			</header>
			<main class="content">
				@if (found) {
					<article class="note">
						<div>
							<h1>Groceries</h1>
							<p class="meta">Shopping · Deleted {deleted} times</p>
						</div>
						<div class="body">
							<p>Milk and eggs</p>
							<p>Bread</p>
							<p>Coffee beans</p>
						</div>
						<div class="actions">
							<button type="button" class="button" onClick={() => (found = false)}>
								Hide note
							</button>
							<button type="button" class="button danger" onClick={() => (confirming = true)}>
								Delete
							</button>
						</div>
					</article>
				} @else {
					<section class="missing">
						<h1>Note not found</h1>
						<button type="button" class="button" onClick={() => (found = true)}>
							Show note
						</button>
					</section>
				}
			</main>
			<modal.root open={confirming} onChange={(open: boolean) => (confirming = open)}>
				<modal.backdrop class="backdrop">
					<modal.content class="dialog">
						<modal.title class="dialog-title">Delete this note?</modal.title>
						<modal.description>“Groceries” will be gone for good.</modal.description>
						<div class="dialog-actions">
							<modal.close class="button">Keep it</modal.close>
							<button
								type="button"
								class="button danger solid"
								onClick={() => {
									deleted = deleted + 1;
									confirming = false;
								}}
							>
								Delete note
							</button>
						</div>
					</modal.content>
				</modal.backdrop>
			</modal.root>
		</div>
	</>
}
