import type { Children } from '@markless/core';

/** The three window buttons of a macOS title bar, in the brand pastels. */
export function WindowDots() @{
	<span class="wd" aria-hidden="true"><i></i><i></i><i></i>
		<style>
			.wd {
				display: inline-flex;
				flex: none;
				gap: 0.32em;
			}

			.wd i {
				box-sizing: border-box;
				width: 0.62em;
				height: 0.62em;
				border: 1px solid var(--ink);
				border-radius: 50%;
				background: var(--pink);
			}

			.wd i:nth-child(2) {
				background: var(--yellow);
			}

			.wd i:nth-child(3) {
				background: var(--green-star);
			}
		</style>
	</span>
}

/** A small browser window: a title bar with the window dots and an address pill, then the page. */
export default function BrowserFrame({
	address,
	children,
}: {
	/** Shown in the address pill. Read once, so pass a fixed route. */
	readonly address?: string;
	readonly children?: Children;
}) @{
	<div class="bf">
		<div class="bf-bar" aria-hidden="true">
			<WindowDots />
			<span class="bf-address">{address ?? 'your page'}</span>
		</div>
		<div class="bf-view">{children}</div>
		<style>
			.bf {
				box-sizing: border-box;
				display: grid;
				grid-template-rows: auto 1fr;
				min-width: 0;
				border: 1px solid var(--ink);
				border-radius: 8px;
				background: var(--paper);
				color: var(--ink);
				overflow: hidden;
			}

			.bf-bar {
				display: flex;
				align-items: center;
				gap: 0.75em;
				padding: 0.42em 0.7em;
				border-block-end: 1px solid var(--pg-edge, var(--ink));
				background: color-mix(in srgb, var(--ink) var(--hover-wash), var(--paper));
				font-size: var(--step--1);
			}

			.bf-address {
				flex: 1;
				min-width: 0;
				max-width: 16em;
				padding: 0.05em 0.75em;
				border: 1px solid var(--pg-edge, var(--ink));
				border-radius: 999px;
				background: var(--paper);
				color: var(--muted-ink);
				font-family: var(--font-mono);
				font-size: 0.82em;
				line-height: 1.5;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}

			.bf-view {
				display: grid;
				min-width: 0;
			}
		</style>
	</div>
}
