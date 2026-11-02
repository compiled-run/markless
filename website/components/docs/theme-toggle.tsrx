import { storage } from '@markless/core';
import { art } from './navbar/theme-art.art.ts';

export default function ThemeToggle() @{
	// oxlint-disable-next-line no-unused-vars -- the write persists the choice
	let theme = storage('theme', 'system');

	<span class="theme-toggle-island">
		<style>
			.theme-toggle-island {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				inline-size: 2.5rem;
				block-size: 2.5rem;
				flex: none;
			}

			.theme-toggle {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				inline-size: 100%;
				block-size: 100%;
				padding: 0;
				color: var(--ink);
				background: none;
				border: 0;
				border-radius: 999px;
				cursor: pointer;
			}

			/* Only a click animates the swap, never a page load or a navigation that renders the toggle afresh. */
			html[data-theme-switching] .theme-toggle {
				transition:
					rotate 420ms cubic-bezier(0.3, 1.5, 0.5, 1),
					scale 420ms cubic-bezier(0.3, 1.5, 0.5, 1),
					opacity 240ms ease,
					display 420ms allow-discrete;

				@starting-style {
					rotate: -70deg;
					scale: 0.4;
					opacity: 0;
				}
			}

			.theme-toggle:hover {
				background: color-mix(in oklch, var(--ink) var(--hover-wash), transparent);
			}

			.theme-toggle:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 1px;
			}

			.theme-toggle-icon {
				inline-size: 1.9rem;
				block-size: 1.9rem;
				overflow: visible;
			}

			/* The wash spreads after the ink lands, like paint soaking into the paper. */
			.theme-toggle-wash {
				fill: var(--yellow);
				opacity: 0.75;
				mix-blend-mode: multiply;
				transform-origin: center;
				transform-box: fill-box;

				html[data-theme-switching] & {
					transition:
						scale 520ms 160ms ease-out,
						opacity 520ms 160ms ease-out;

					@starting-style {
						scale: 0.3;
						opacity: 0;
					}
				}

				html.dark & {
					opacity: 0.45;
					mix-blend-mode: normal;
				}
			}

			.theme-toggle-hatch {
				fill: none;
				stroke: currentColor;
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.75;
			}

			.theme-toggle-ink {
				fill: currentColor;
			}

			/* The button offered is the one for the palette not painted: theme.js
			   resolves `system` and puts the painted palette on <html> as a class. */
			.theme-toggle-to-dark {
				display: inline-flex;

				html.dark & {
					display: none;
				}
			}

			.theme-toggle-to-light {
				display: none;

				html.dark & {
					display: inline-flex;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				html[data-theme-switching] :is(.theme-toggle, .theme-toggle-wash) {
					transition: none;
				}
			}
		</style>
		<button
			class="theme-toggle theme-toggle-to-dark"
			type="button"
			data-theme-toggle="dark"
			aria-label="Switch to the dark theme"
			title="Switch to the dark theme"
			onClick={(event) => {
				const root = document.documentElement;
				const island = (event.target as Element).closest('.theme-toggle-island');
				root.dataset.themeSwitching = '';
				theme = 'dark';
				// The pressed button is hidden now, so focus moves to the one that took its place.
				setTimeout(() => island?.querySelector<HTMLElement>('[data-theme-toggle="light"]')?.focus(), 0);
				setTimeout(() => delete root.dataset.themeSwitching, 700);
			}}
		>
			<svg class="theme-toggle-icon theme-toggle-sun" viewBox={'0 0 ' + art.sun.width + ' ' + art.sun.height} aria-hidden="true">
				<path class="theme-toggle-wash" d={art.sun.wash} />
				<path class="theme-toggle-hatch" d={art.sun.hatch} />
				<path class="theme-toggle-ink" d={art.sun.ink} />
			</svg>
		</button>
		<button
			class="theme-toggle theme-toggle-to-light"
			type="button"
			data-theme-toggle="light"
			aria-label="Switch to the light theme"
			title="Switch to the light theme"
			onClick={(event) => {
				const root = document.documentElement;
				const island = (event.target as Element).closest('.theme-toggle-island');
				root.dataset.themeSwitching = '';
				theme = 'light';
				// The pressed button is hidden now, so focus moves to the one that took its place.
				setTimeout(() => island?.querySelector<HTMLElement>('[data-theme-toggle="dark"]')?.focus(), 0);
				setTimeout(() => delete root.dataset.themeSwitching, 700);
			}}
		>
			<svg class="theme-toggle-icon theme-toggle-moon" viewBox={'0 0 ' + art.moon.width + ' ' + art.moon.height} aria-hidden="true">
				<path class="theme-toggle-wash" d={art.moon.wash} />
				<path class="theme-toggle-hatch" d={art.moon.hatch} />
				<path class="theme-toggle-ink" d={art.moon.ink} />
			</svg>
		</button>
	</span>
}
