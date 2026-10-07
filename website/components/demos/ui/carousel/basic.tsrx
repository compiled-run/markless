import { carousel, lucide } from '@markless/ui';

export default function CarouselBasic() @{
	<carousel.root class="carousel" value="paris">
		<carousel.title class="title">Featured destinations</carousel.title>
		<div class="frame">
			<carousel.backtrigger class="step">
				<lucide.chevronleft class="step-icon" aria-hidden="true" />
			</carousel.backtrigger>
			<carousel.scrollarea class="window">
				<carousel.item class="slide" value="paris">
					<span class="slide-name">Paris</span>
					<span class="slide-note">Cafés and long walks</span>
				</carousel.item>
				<carousel.item class="slide" value="oslo">
					<span class="slide-name">Oslo</span>
					<span class="slide-note">Fjords and wooden houses</span>
				</carousel.item>
				<carousel.item class="slide" value="lima">
					<span class="slide-name">Lima</span>
					<span class="slide-note">Cliffs above the Pacific</span>
				</carousel.item>
			</carousel.scrollarea>
			<carousel.forwardtrigger class="step">
				<lucide.chevronright class="step-icon" aria-hidden="true" />
			</carousel.forwardtrigger>
		</div>
		<carousel.navlist class="dots" aria-label="Choose a destination">
			<carousel.navtrigger class="dot" value="paris" aria-label="Paris" />
			<carousel.navtrigger class="dot" value="oslo" aria-label="Oslo" />
			<carousel.navtrigger class="dot" value="lima" aria-label="Lima" />
		</carousel.navlist>

		<style>
			.carousel {
				display: grid;
				gap: 0.8em;
				justify-items: center;
				width: min(28rem, 100%);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
				color: var(--ink);
			}

			.title {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-0);
			}

			.frame {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr) auto;
				gap: 0.75em;
				align-items: center;
				width: 100%;
			}

			/* The track is the family's own element: a max-content column sizes it to the whole slide row. */
			.window {
				display: grid;
				grid-auto-columns: max-content;
				container-type: inline-size;
				overflow: hidden;
				border: 1px solid var(--ink);
				border-radius: 6px;
				font-size: 0;
				white-space: nowrap;
				touch-action: pan-y;
			}

			.window[ui-draggable] {
				cursor: grab;
			}

			.slide {
				display: inline-grid;
				place-content: center;
				box-sizing: border-box;
				width: 100cqi;
				font-size: var(--step--1);
				white-space: normal;
				vertical-align: top;
				min-height: 8.5rem;
				padding: 1em;
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
				text-align: center;
				user-select: none;
			}

			.slide-name {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: var(--step-2);
				line-height: 1.1;
			}

			.slide-note {
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.step {
				display: grid;
				place-items: center;
				box-sizing: border-box;
				width: 2.4em;
				height: 2.4em;
				padding: 0;
				border: 1px solid var(--ink);
				border-radius: 999px;
				background: var(--paper);
				color: var(--ink);
				cursor: pointer;
				transition: background 140ms ease;
			}

			.step:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.step:active {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.step-icon {
				width: 1.1em;
				height: 1.1em;
			}

			.dots {
				display: flex;
				gap: 0.6em;
			}

			.dot {
				box-sizing: border-box;
				width: 0.9em;
				height: 0.9em;
				padding: 0;
				border: 1px solid var(--ink);
				border-radius: 999px;
				background: var(--paper);
				cursor: pointer;
				transition: background 140ms ease;
			}

			.dot:hover {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.dot[ui-active] {
				background: var(--purple);
			}

			.step:focus-visible,
			.dot:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 3px;
			}

			@media (prefers-reduced-motion: reduce) {
				.step,
				.dot {
					transition: none;
				}
			}
		</style>
	</carousel.root>;
}
