import { storage } from '@markless/core';
import { navbar } from '@markless/ui';
import { art } from './navbar/theme-art.art.ts';

/** `inBar` makes each button a `navbar.trigger`, so the bar's arrow keys stop on it; it must then sit inside `navbar.root`. */
export default function ThemeToggle({ inBar }: { readonly inBar?: boolean }) @{
	<span class="theme-toggle-island">
		<ThemeButton to="dark" inBar={inBar === true} />
		<ThemeButton to="light" inBar={inBar === true} />

		<style>
			.theme-toggle-island {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				inline-size: 2.5rem;
				block-size: 2.5rem;
				flex: none;
			}
		</style>
	</span>
}

/** The button that switches to `to`. It draws the theme it stands in: the sun on the light page, the moon on the dark one. */
function ThemeButton({ to, inBar }: { readonly to: 'dark' | 'light'; readonly inBar: boolean }) @{
	// oxlint-disable-next-line no-unused-vars -- the write persists the choice
	let theme = storage('theme', 'system');
	// The handlers read the choice off the pressed button: a prop read in this arm's handler resolved to the other instance's value.
	const label = to === 'dark' ? 'Switch to the dark theme' : 'Switch to the light theme';

	<>
		@if (inBar) {
			<navbar.trigger
				class={'theme-toggle theme-toggle-to-' + to}
				data-theme-toggle={to}
				aria-label={label}
				title={label}
				onClick={(event) => {
					const root = document.documentElement;
					const pressed = (event.target as Element).closest<HTMLElement>('[data-theme-toggle]');
					const island = pressed?.closest('.theme-toggle-island');
					const chosen = pressed?.dataset.themeToggle === 'dark' ? 'dark' : 'light';
					root.dataset.themeSwitching = '';
					theme = chosen;
					// The pressed button is hidden now, so focus moves to the one that took its place.
					setTimeout(() => island?.querySelector<HTMLElement>(`[data-theme-toggle="${chosen === 'dark' ? 'light' : 'dark'}"]`)?.focus(), 0);
					setTimeout(() => delete root.dataset.themeSwitching, 700);
				}}
			>
				<ThemeDrawing to={to} />
			</navbar.trigger>
		} @else {
			<button
				type="button"
				class={'theme-toggle theme-toggle-to-' + to}
				data-theme-toggle={to}
				aria-label={label}
				title={label}
				onClick={(event) => {
					const root = document.documentElement;
					const pressed = (event.target as Element).closest<HTMLElement>('[data-theme-toggle]');
					const island = pressed?.closest('.theme-toggle-island');
					const chosen = pressed?.dataset.themeToggle === 'dark' ? 'dark' : 'light';
					root.dataset.themeSwitching = '';
					theme = chosen;
					// The pressed button is hidden now, so focus moves to the one that took its place.
					setTimeout(() => island?.querySelector<HTMLElement>(`[data-theme-toggle="${chosen === 'dark' ? 'light' : 'dark'}"]`)?.focus(), 0);
					setTimeout(() => delete root.dataset.themeSwitching, 700);
				}}
			>
				<ThemeDrawing to={to} />
			</button>
		}

		<style>
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
				html[data-theme-switching] .theme-toggle {
					transition: none;
				}
			}
		</style>
	</>
}

function ThemeDrawing({ to }: { readonly to: 'dark' | 'light' }) @{
	const drawing = to === 'dark' ? art.sun : art.moon;

	<svg
		class={to === 'dark' ? 'theme-toggle-icon theme-toggle-sun' : 'theme-toggle-icon theme-toggle-moon'}
		viewBox={'0 0 ' + drawing.width + ' ' + drawing.height}
		aria-hidden="true"
	>
		<path class="theme-toggle-wash" d={drawing.wash} />
		<path class="theme-toggle-hatch" d={drawing.hatch} />
		<path class="theme-toggle-ink" d={drawing.ink} />

		<style>
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

			@media (prefers-reduced-motion: reduce) {
				html[data-theme-switching] .theme-toggle-wash {
					transition: none;
				}
			}
		</style>
	</svg>
}
