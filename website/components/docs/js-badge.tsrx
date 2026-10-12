/** A hand-inked JavaScript badge to sit inline beside running text. */
export default function JsBadge() @{
	<svg class="js-badge" viewBox="0 0 40 40" role="img" aria-label="JavaScript">
		<path class="paper" d="M4.6 5.2 C13 3.9 26 4.3 35.4 4.8 C36.3 14 36.1 25.6 35.6 35.2 C25.8 36.2 14.2 36 4.9 35.4 C3.9 25.6 4.1 14.6 4.6 5.2 Z" />
		<path class="line" d="M4.6 5.2 C13 3.9 26 4.3 35.4 4.8 C36.3 14 36.1 25.6 35.6 35.2 C25.8 36.2 14.2 36 4.9 35.4 C3.9 25.6 4.1 14.6 4.6 5.2 Z" />
		<path class="line faint" d="M5.4 4.4 C14 4.8 25 3.8 36.2 5.6 M36.4 6 C35.8 16 36.8 27 36.1 36" />
		<text class="label" x="34.5" y="33">JS</text>
		<style>
			.js-badge {
				display: inline-block;
				width: 1.45em;
				height: 1.45em;
				vertical-align: top;
				rotate: -4deg;
			}

			.paper {
				fill: var(--yellow);
			}

			.line {
				fill: none;
				stroke: var(--on-accent);
				stroke-width: 1.8;
				stroke-linecap: round;
				stroke-linejoin: round;
			}

			.faint {
				stroke-width: 0.9;
				opacity: 0.5;
			}

			.label {
				fill: var(--on-accent);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 21px;
				font-weight: 800;
				text-anchor: end;
			}
		</style>
	</svg>
}
