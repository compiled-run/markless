import type { Children } from '@markless/core';
import { WindowDots } from './browser-frame.tsrx';

/** A small terminal window: a title bar with the window dots, then mono output on the dark slab. */
export default function TerminalFrame({ title, children }: { readonly title?: string; readonly children?: Children }) @{
	<div class="tf">
		<div class="tf-bar" aria-hidden="true">
			<WindowDots />
			<span class="tf-title">{title ?? 'Terminal'}</span>
		</div>
		<div class="tf-body">{children}</div>
		<style>
			.tf {
				box-sizing: border-box;
				min-width: 0;
				border: 1px solid var(--ink);
				border-radius: 8px;
				background: var(--slab);
				color: var(--slab-ink);
				overflow: hidden;
			}

			.tf-bar {
				display: flex;
				align-items: center;
				gap: 0.75em;
				padding: 0.42em 0.7em;
				border-block-end: 1px solid color-mix(in srgb, var(--slab-ink) 25%, transparent);
				font-size: var(--step--1);
			}

			.tf-title {
				color: color-mix(in srgb, var(--slab-ink) 70%, var(--slab));
				font-family: var(--font-mono);
				font-size: 0.82em;
			}

			.tf-body {
				padding: 0.7em 0.9em 0.8em;
				font-family: var(--font-mono);
				font-size: 0.85em;
				line-height: 1.6;
			}

			.tf-body :where(*) {
				font-family: var(--font-mono);
			}
		</style>
	</div>
}
