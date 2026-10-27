// A margin note on a paper card: the border wobbles through an SVG displacement filter, so the ink holds at any size.
import type { Children } from '@markless/core';

export default function Collapsible({
	summary,
	text,
	sprite,
	children,
}: {
	readonly summary: string;
	/** One paragraph; pass children instead for several. */
	readonly text?: string;
	/** `thought-bubble` (the default) or `star-badge`, drawn in ink beside the summary. */
	readonly sprite?: string;
	readonly children?: Children;
}) @{
	const mark = sprite === 'star-badge' ? 'star-badge' : 'thought-bubble';
	const wobble = 'collapsible-wobble-' + summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	// The intrinsic SVG types do not list filter-primitive attributes yet, so they ride in through spreads.
	const turbulence = { type: 'fractalNoise', baseFrequency: '0.035', numOctaves: '2', seed: '7' };
	const displacement = { in: 'SourceGraphic', scale: '3.2' };

	<div class="collapsible">
		<svg class="collapsible-card" aria-hidden="true">
			<filter id={wobble} x="-2%" y="-10%" width="104%" height="120%">
				<feTurbulence {...turbulence} />
				<feDisplacementMap {...displacement} />
			</filter>
			<g style={'filter:url(#' + wobble + ')'}>
				<rect class="collapsible-shadow" x="5" y="5" width="100%" height="100%" rx="9" />
				<rect class="collapsible-paper" x="1" y="1" width="100%" height="100%" rx="9" />
				<rect class="collapsible-trace" x="0" y="2" width="100%" height="100%" rx="11" />
			</g>
		</svg>
		<svg class="collapsible-fold" viewBox="0 0 30 30" aria-hidden="true">
			<path class="collapsible-cut" d="M-0.1 -2H33V30.6Z" />
			<path class="collapsible-flap" d="M2.2 0.3C1.4 7.6 2.6 15.4 2.9 21.5C10.4 22.3 17.2 21.9 24.4 22.1Z" />
			<path class="collapsible-crease" d="M2.2 0.3C9.3 7.1 16.8 15 24.4 22.1M2.4 1.2C1.6 8.4 2.7 15.6 3 21.4C10.3 22.2 17 21.8 24 22" />
		</svg>
		<details class="collapsible-note">
			<summary class="collapsible-summary">
				<svg class="collapsible-arrow" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M8.4 5.1C10.6 7.4 13.4 9.9 15.8 12.3C13.5 14.6 11 16.7 8.9 19.1" />
					<path class="collapsible-retrace" d="M8.9 5.6C11 7.6 13.1 9.9 15.3 12C13.2 14.3 10.9 16.5 9.2 18.6" />
				</svg>
				@if (mark === 'star-badge') {
					<svg class="collapsible-mark" viewBox="0 0 24 24" aria-hidden="true">
						<path class="collapsible-wash" d="M11.4 2.6L13.9 9.2L20.9 9.7L15.4 14L17.4 20.8L11.3 16.8L5.3 20.5L7.2 13.8L1.8 9.4L8.7 9Z" />
						<path d="M12.2 1.8L14.6 8.6L21.6 9.1L16 13.4L18.1 20.3L11.9 16.2L5.9 19.9L7.8 13.2L2.4 8.8L9.4 8.4Z" />
						<path class="collapsible-retrace" d="M12.4 2.6L14.2 8.2M17.2 19.6L15.4 13.6L20.6 9.6" />
					</svg>
				} @else {
					<svg class="collapsible-mark" viewBox="0 0 24 24" aria-hidden="true">
						<path class="collapsible-wash" d="M6.4 15C3.8 15.2 2 13.4 2.4 11.1C2.7 9.3 4.3 8.4 5.8 8.6C6.1 6.2 8.2 4.6 10.6 5C12 5.2 13 6 13.6 7C14.8 5.9 16.8 5.8 18.1 6.9C19.4 7.9 19.7 9.5 19.1 10.8C20.7 11.4 21.5 13.1 20.9 14.6C20.3 16 18.9 16.7 17.5 16.4C16.6 17.7 14.8 18.2 13.3 17.5C12.1 18.5 10.2 18.6 9 17.7C8.1 17.1 7.6 16.1 7.6 15Z" />
						<path d="M7 15.5C4.4 15.7 2.6 13.9 3 11.6C3.3 9.8 4.9 8.9 6.4 9.1C6.7 6.7 8.8 5.1 11.2 5.5C12.6 5.7 13.6 6.5 14.2 7.5C15.4 6.4 17.4 6.3 18.7 7.4C20 8.4 20.3 10 19.7 11.3C21.3 11.9 22.1 13.6 21.5 15.1C20.9 16.5 19.5 17.2 18.1 16.9C17.2 18.2 15.4 18.7 13.9 18C12.7 19 10.8 19.1 9.6 18.2C8.7 17.6 8.2 16.6 8.2 15.5" />
						<path d="M5.3 18.2C4.4 18.4 4 19.6 4.7 20.2C5.4 20.8 6.6 20.4 6.6 19.4C6.6 18.6 6 18.1 5.3 18.2ZM2.6 21.5C2 21.8 2.2 22.7 2.9 22.7C3.5 22.6 3.6 21.8 3.1 21.5" />
						<path class="collapsible-retrace" d="M11.6 6C12.9 6.3 13.6 7 14 7.9M18.4 7.8C19.4 8.6 19.7 9.8 19.4 10.9" />
					</svg>
				}
				<span>{summary}</span>
			</summary>
			<div class="collapsible-body">
				@if (text) {
					<p>{text}</p>
				}
				{children}
			</div>
		</details>
		<style>
			.collapsible {
				position: relative;
				isolation: isolate;
				margin-block: var(--space-m);
				margin-inline-end: 6px;
			}

			.collapsible-card {
				position: absolute;
				inset: 0 2px 2px 0;
				z-index: -1;
				width: calc(100% - 2px);
				height: calc(100% - 2px);
				overflow: visible;
			}

			.collapsible-shadow {
				fill: color-mix(in srgb, var(--pink) 45%, var(--paper));
			}

			.collapsible-paper {
				fill: var(--raised);
				stroke: var(--ink);
				stroke-width: 1.6;
			}

			.collapsible-trace {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				opacity: 0.45;
			}

			.collapsible-fold {
				position: absolute;
				top: 0;
				right: -6px;
				z-index: -1;
				width: 30px;
				height: 30px;
				overflow: visible;
				pointer-events: none;
			}

			.collapsible-cut {
				fill: var(--paper);
			}

			.collapsible-flap {
				fill: color-mix(in oklch, var(--raised) 82%, var(--ink));
			}

			.collapsible-crease {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.3;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.collapsible-summary {
				display: flex;
				gap: 0.45em;
				align-items: center;
				padding: var(--space-xs) calc(var(--space-s) + 18px) var(--space-xs) var(--space-xs);
				border-radius: 9px;
				font-weight: 700;
				list-style: none;
				cursor: pointer;
				-webkit-tap-highlight-color: transparent;
			}

			.collapsible-summary::-webkit-details-marker {
				display: none;
			}

			.collapsible-summary:focus-visible {
				outline: 2px dashed currentColor;
				outline-offset: -7px;
			}

			.collapsible-summary:hover .collapsible-wash {
				opacity: 0.9;
			}

			.collapsible-arrow,
			.collapsible-mark {
				flex: none;
				fill: none;
				stroke: currentColor;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.collapsible-arrow {
				width: 1.1em;
				height: 1.1em;
				stroke-width: 2.2;
				transition: transform 220ms cubic-bezier(0.3, 1.4, 0.5, 1);
			}

			.collapsible-mark {
				width: 1.5em;
				height: 1.5em;
				stroke-width: 1.4;
				overflow: visible;
			}

			.collapsible-wash {
				fill: var(--pink);
				stroke: none;
				opacity: 0.6;
				transition: opacity 160ms ease;
			}

			.collapsible-retrace {
				stroke-width: 0.8;
				opacity: 0.5;
			}

			.collapsible-note[open] .collapsible-arrow {
				transform: rotate(90deg);
			}

			.collapsible-note {
				interpolate-size: allow-keywords;
			}

			.collapsible-note::details-content {
				block-size: 0;
				overflow: clip;
				opacity: 0;
				transition:
					block-size 260ms ease,
					opacity 200ms ease,
					content-visibility 260ms allow-discrete;
			}

			.collapsible-note[open]::details-content {
				block-size: auto;
				opacity: 1;
			}

			.collapsible-body {
				padding: 0 var(--space-s) var(--space-xs) calc(var(--space-xs) + 1.55em);
			}

			.collapsible-body > :first-child {
				margin-top: 0;
			}

			.collapsible-body > :last-child {
				margin-bottom: 0;
			}

			@media (prefers-reduced-motion: reduce) {
				.collapsible-arrow,
				.collapsible-note::details-content {
					transition: none;
				}
			}
		</style>
	</div>
}
