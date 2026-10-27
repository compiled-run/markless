// A real button drawn as a raised paper tab in fineliner ink; a chosen button carries a pink marker wash.
import type { Children } from '@markless/core';
import { computed } from '@markless/core';
import { art } from './screen.art.ts';

export default function InkButton({
	pressed,
	alt,
	onClick,
	children,
}: {
	/** Written as `aria-pressed`, and shown with a marker wash. Leave it out for a plain button. */
	readonly pressed?: boolean;
	/** Draw the second tab shape, so two buttons side by side are not copies of each other. */
	readonly alt?: boolean;
	readonly onClick?: () => void;
	readonly children?: Children;
}) @{
	const tab = alt === true ? art.buttonAlt : art.button;
	const state = computed(() => (pressed === undefined ? undefined : pressed ? 'true' : 'false'));

	<button type="button" class="ink-button" aria-pressed={state} onClick={() => onClick?.()}>
		<svg viewBox={'0 0 ' + tab.width + ' ' + tab.height} preserveAspectRatio="none" aria-hidden="true">
			<path class="side" d={tab.side} />
			<path class="face" d={tab.face} />
			<path class="wash" d={tab.wash} />
			<path class="edge" d={tab.ink} />
		</svg>
		<span class="label">{children}</span>
		<style>
			.ink-button {
				position: relative;
				display: inline-grid;
				place-items: center;
				width: 7rem;
				height: 2.75rem;
				padding: 0 0 0.3rem;
				border: 0;
				background: none;
				color: var(--screen-ink, var(--ink));
				font: 700 0.95rem/1 'Shantell Sans', system-ui, sans-serif;
				cursor: pointer;
				-webkit-tap-highlight-color: transparent;
			}

			svg {
				position: absolute;
				inset: 0;
				width: 100%;
				height: 100%;
				overflow: visible;
				transition: transform 120ms ease;
			}

			.label {
				position: relative;
				transition: transform 120ms ease;
			}

			.ink-button:active svg,
			.ink-button:active .label {
				transform: translateY(2px);
			}

			.face {
				fill: var(--screen-paper, var(--paper));
				transition: fill 360ms ease;
			}

			.side {
				fill: none;
				stroke: var(--screen-ink, var(--ink));
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.8;
			}

			.edge {
				fill: var(--screen-ink, var(--ink));
				transition: fill 360ms ease;
			}

			.wash {
				fill: var(--pink);
				opacity: 0;
				transition: opacity 240ms ease;
			}

			.ink-button[aria-pressed='true'] .wash {
				opacity: 0.85;
			}

			.ink-button[aria-pressed='true'] .label {
				color: oklch(28% 0.015 90);
			}

			.ink-button:hover .wash {
				opacity: 0.25;
			}

			.ink-button[aria-pressed='true']:hover .wash {
				opacity: 0.95;
			}

			.ink-button:focus-visible {
				outline: 2px dashed currentColor;
				outline-offset: 3px;
				border-radius: 10px;
			}
		</style>
	</button>
}
