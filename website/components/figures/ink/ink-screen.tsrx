// A live preview drawn as an inked sheet of paper on the desk: the sheet stretches to fit whatever HTML sits on it.
import type { Children } from '@markless/core';
import { computed } from '@markless/core';
import { art } from './screen.art.ts';

export default function InkScreen({
	url,
	tone,
	label,
	children,
}: {
	/** Lettered in the browser bar. */
	readonly url: string;
	/** `dark` turns the sheet to ink with paper-coloured lettering; it is light paper in both site themes otherwise. */
	readonly tone?: string;
	/** The accessible name of the preview region. */
	readonly label?: string;
	readonly children?: Children;
}) @{
	const shade = computed(() => (tone === 'dark' ? 'dark' : 'light'));

	<section class="ink-screen" data-tone={shade} aria-label={label}>
		@for (const sheet of [art.wide, art.narrow]; key sheet.width) {
			<svg class="sheet" data-fit={sheet === art.wide ? 'wide' : 'narrow'} viewBox={'0 0 ' + sheet.width + ' ' + sheet.height} preserveAspectRatio="none" aria-hidden="true">
				<path class="pencil" d={sheet.pencil} />
				<path class="shadow" d={sheet.shadow.wash} />
				<path class="hatch" d={sheet.shadow.hatch} />
				<path class="paper" d={sheet.paper} />
				<path class="edge" d={sheet.ink} />
			</svg>
		}
		<div class="bar">
			@for (const sheet of [art.wide, art.narrow]; key sheet.width) {
				<svg class="sheet" data-fit={sheet === art.wide ? 'wide' : 'narrow'} viewBox={'0 0 ' + sheet.width + ' 31'} preserveAspectRatio="none" aria-hidden="true">
					<path class="tone" d={sheet.bar.tone} />
					<path class="lines" d={sheet.bar.rule} />
					<path class="lines" d={sheet.bar.dots} />
					<path class="lines" d={sheet.bar.url} />
				</svg>
			}
			<span class="url">{url}</span>
		</div>
		<div class="body">{children}</div>
		<style>
			.ink-screen {
				--screen-paper: color-mix(in oklch, var(--paper) 50%, white);
				--screen-ink: var(--ink);
				--screen-edge: var(--ink);
				--screen-shade: color-mix(in oklch, var(--ink) 22%, transparent);
				--screen-hatch: var(--ink);
				position: relative;
				container: ink-screen / inline-size;
				margin: 0.4rem 0.9rem 1.1rem 0.3rem;
				color: var(--screen-ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;

				html.dark & {
					--screen-paper: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--screen-ink: var(--paper);
					--screen-edge: var(--paper);
					--screen-shade: rgb(0 0 0 / 0.55);
					--screen-hatch: rgb(0 0 0 / 0.85);
				}
			}

			.ink-screen[data-tone='dark'] {
				--screen-paper: oklch(27% 0.014 70);
				--screen-ink: oklch(93% 0.012 85);
				--screen-edge: var(--ink);

				html.dark & {
					--screen-paper: oklch(24% 0.012 70);
					--screen-ink: oklch(93% 0.012 85);
					--screen-edge: var(--ink);
				}
			}

			.sheet {
				position: absolute;
				inset: 0;
				width: 100%;
				height: 100%;
				overflow: visible;
				pointer-events: none;
			}

			.sheet[data-fit='narrow'] {
				display: none;
			}

			@container ink-screen (max-width: 380px) {
				.sheet[data-fit='wide'] {
					display: none;
				}

				.sheet[data-fit='narrow'] {
					display: block;
				}
			}

			.paper {
				fill: var(--screen-paper);
			}

			.edge {
				fill: var(--screen-edge);
			}

			.lines {
				fill: var(--screen-ink);
			}

			.shadow {
				fill: var(--screen-shade);
			}

			.hatch,
			.tone {
				fill: none;
				stroke: var(--screen-ink);
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.55;
			}

			.hatch {
				stroke: var(--screen-hatch);
				opacity: 0.7;
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.5;

				html.dark & {
					opacity: 0.32;
				}
			}

			.bar {
				position: relative;
				height: 31px;
				display: flex;
				align-items: center;
				padding-inline-start: 19.5%;
			}

			.url {
				position: relative;
				font-size: 0.72rem;
				line-height: 1;
				opacity: 0.75;
				white-space: nowrap;
			}

			.body {
				position: relative;
			}
		</style>
	</section>
}
