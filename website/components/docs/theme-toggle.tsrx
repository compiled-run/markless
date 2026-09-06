import { storage } from '@markless/core';

export default function ThemeToggle() @{
	let theme = storage('theme', 'system');

	<span class="theme-toggle-island">
		<style>
			.theme-toggle-island {
				position: fixed;
				top: 0;
				right: var(--space-s-l);
				z-index: 40;
				block-size: var(--header-height);
				display: flex;
				align-items: center;
				font-size: var(--step--1);
			}

			/* The drawing inside the button. It is a die-cut sticker with its own white
			   border and shadow, so it is given the button's whole box and no chrome of its
			   own: the ring the button used to draw around a glyph would be a second edge
			   around an edge. */
			.theme-toggle-icon {
				display: block;
				inline-size: var(--theme-toggle-size);
				block-size: var(--theme-toggle-size);
				object-fit: contain;
			}

			/* Which of the two buttons is the one to offer is the same question as which
			   palette is painted, so these rules are the palette's rules again, in step with
			   the pair further down. `system` and "no attribute" both mean "ask the
			   operating system", which is why neither is named. */
			.theme-toggle-to-dark {
				display: inline-flex;
			}

			.theme-toggle-to-light {
				display: none;
			}

			html[data-theme='dark'] .theme-toggle-to-dark {
				display: none;
			}

			html[data-theme='dark'] .theme-toggle-to-light {
				display: inline-flex;
			}
		</style>
		<button
			class="theme-toggle theme-toggle-to-dark"
			type="button"
			data-theme-toggle="dark"
			aria-label="Switch to the dark theme"
			title="Switch to the dark theme"
			onClick={() => {
				theme = 'dark';
			}}
		>
			<img
				class="theme-toggle-icon"
				src="/markless/theme/sun.png"
				alt=""
				aria-hidden="true"
				decoding="async"
			/>
		</button>
		<button
			class="theme-toggle theme-toggle-to-light"
			type="button"
			data-theme-toggle="light"
			aria-label="Switch to the light theme"
			title="Switch to the light theme"
			onClick={() => {
				theme = 'light';
			}}
		>
			<img
				class="theme-toggle-icon"
				src="/markless/theme/moon.png"
				alt=""
				aria-hidden="true"
				decoding="async"
			/>
		</button>
	</span>
}
