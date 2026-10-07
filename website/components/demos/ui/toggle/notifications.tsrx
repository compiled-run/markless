import { toggle } from '@markless/ui';

export default function Notifications() @{
	<toggle.root class="row" name="notifications">
		<toggle.label class="label">Email me when an order ships</toggle.label>
		<toggle.trigger class="track">
			<toggle.thumb class="thumb" />
		</toggle.trigger>
		<toggle.field />

		<style>
			.row {
				display: flex;
				gap: 0.8em;
				align-items: center;
			}

			.label {
				cursor: pointer;
			}

			.track {
				position: relative;
				width: 3em;
				height: 1.6em;
				padding: 0;
				border: 2px solid var(--ink);
				border-radius: 999px;
				background: var(--paper);
				box-shadow: none;
				cursor: pointer;
			}

			.track[ui-checked] {
				background: var(--yellow);
			}

			.track:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			.thumb {
				position: absolute;
				inset-block: 0.15em;
				inset-inline-start: 0.15em;
				width: 1.1em;
				border-radius: 50%;
				background: var(--ink);
				transition: translate 120ms;
			}

			.track[ui-checked] .thumb {
				translate: 1.4em 0;
				background: var(--on-accent);
			}

			@media (prefers-reduced-motion: reduce) {
				.thumb {
					transition: none;
				}
			}
		</style>
	</toggle.root>
}
