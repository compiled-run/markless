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

	<div class="collapsible ink-card">
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
				padding: 0;
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
				user-select: none;
				-webkit-user-select: none;
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
				transition: transform var(--spring-hover-ms) var(--spring-hover);
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

			/* The rows grow from 0fr, which every engine interpolates; align-content: start keeps the summary row from stretching into the free space between 0fr and 1fr. Hidden by visibility, not the UA's content-visibility, which WebKit drops at once on close. */
			.collapsible-note {
				display: grid;
				grid-template-rows: auto 0fr;
				align-content: start;
				transition: grid-template-rows var(--spring-slide-ms) var(--spring-slide);
			}

			.collapsible-note[open] {
				grid-template-rows: auto 1fr;
			}

			.collapsible-note::details-content {
				min-block-size: 0;
				overflow: clip;
				content-visibility: visible;
				visibility: hidden;
				opacity: 0;
				transition:
					visibility var(--spring-slide-ms),
					opacity var(--spring-slide-ms) ease;
			}

			.collapsible-note[open]::details-content {
				visibility: visible;
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
				.collapsible-note,
				.collapsible-note::details-content {
					transition: none;
				}
			}
		</style>
	</div>
}
