// Belief: the .get in the file name decides which request gets an answer.
// Objects: the machine named users/[id].get.ts (its plate never changes), the answer card, the coin.
// Action: press GET or POST. Change: GET drops {"id":"42"}; POST drops nothing and the coin rattles back.
// Prevents: "a file in api/ answers every request to its address, whatever the method".
import { computed, element, state } from '@markless/core';
import { ANSWER, describeVending, FILE, FILE_PARTS, flip, type Pressed, VENDING_TOUR } from './model.ts';
import { art } from './vending.art.ts';

export default function VendingAnatomy() @{
	let pressed = state<Pressed>('none');
	let beat = state('rest');
	let touched = state(false);
	const said = computed(() => describeVending(pressed));
	const getButton = element<HTMLButtonElement>();
	const postButton = element<HTMLButtonElement>();
	const press = (button: Pressed) => {
		pressed = button;
		beat = flip(beat);
	};

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			let step = 0;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				const next = VENDING_TOUR[step % VENDING_TOUR.length];
				step++;
				if (next === 'GET') press('GET');
				else if (step % VENDING_TOUR.length === 0) pressed = 'none';
			}, 2600);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
		onKeyDown={(event) => {
			const key = event.key.toLowerCase();
			if (key === 'escape') {
				touched = true;
				pressed = 'none';
				beat = 'rest';
			} else if (key === 'g' || key === 'p') {
				touched = true;
				press(key === 'g' ? 'GET' : 'POST');
			} else if (key === 'arrowleft') getButton?.focus();
			else if (key === 'arrowright') postButton?.focus();
		}}
	>
		<div class="frame">
			<svg class="scene" data-pressed={pressed} data-beat={beat} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="shadow-wash soft" d={art.machine.cast.wash} />
				<path class="hatch deep faint" d={art.machine.cast.hatch} />
				<path class="box-paper" d={art.machine.paper} />
				<path class="hatch" d={art.machine.shade} />
				<path class="card-paper" d={art.machine.plate} />
				<text class="plate-text" transform={art.machine.plateMatrix}>
					<tspan>{FILE_PARTS[0]}</tspan>
					<tspan class="method-part">{FILE_PARTS[1]}</tspan>
					<tspan>{FILE_PARTS[2]}</tspan>
				</text>
				<path class="tray" d={art.machine.tray} />
				<path class="hatch deep" d={art.machine.trayHatch} />
				<path class="cup" d={art.machine.cup} />
				<path class="hatch deep" d={art.machine.cupHatch} />
				<path class="jar-ink" d={art.machine.ink} />

				<path class="jar-ink" d={art.get.rim} />
				<g class="press get" style={art.get.sink}>
					<path class="card-paper" d={art.get.paper} />
					<path class="wash pink" d={art.get.wash} />
					<path class="jar-ink" d={art.get.ink} />
					<text class="button-text" transform={art.get.matrix}>GET</text>
				</g>
				<path class="jar-ink" d={art.post.rim} />
				<g class="press post" style={art.post.sink}>
					<path class="card-paper" d={art.post.paper} />
					<path class="wash pink" d={art.post.wash} />
					<path class="jar-ink" d={art.post.ink} />
					<text class="button-text" transform={art.post.matrix}>POST</text>
				</g>

				<g class="answer" style={art.card.drop}>
					<path class="card-paper" d={art.card.paper} />
					<path class="wash yellow" d={art.card.wash} />
					<path class="jar-ink" d={art.card.ink} />
					<text class="answer-text" transform={art.card.matrix}>{ANSWER}</text>
				</g>
				<g class="coin" style={'transform-origin:' + art.coin.origin}>
					<path class="coin-paper" d={art.coin.paper} />
					<path class="wash yellow" d={art.coin.wash} />
					<path class="jar-ink" d={art.coin.ink} />
				</g>
			</svg>
			<button
				type="button"
				class="hit get-hit"
				el={getButton}
				style={art.get.place}
				aria-label="Press GET"
				onClick={() => {
					touched = true;
					press('GET');
				}}
			/>
			<button
				type="button"
				class="hit post-hit"
				el={postButton}
				style={art.post.place}
				aria-label="Press POST"
				onClick={() => {
					touched = true;
					press('POST');
				}}
			/>
		</div>
		<figcaption class="sr">
			A pen-and-ink drawing of a vending machine named {FILE}, with two buttons, GET and POST, and an empty tray. Press GET, and a
			card reading {ANSWER} drops into the tray. Press POST, and nothing drops, because the file name says get; the coin rattles back
			out of the return cup. G and P press the buttons, the arrow keys move between them, and Escape empties the tray.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
			}

			.frame {
				position: relative;
			}

			.hit {
				position: absolute;
				width: 13%;
				aspect-ratio: 1;
				translate: -50% -50%;
				padding: 0;
				border: 0;
				border-radius: 50%;
				background: none;
				cursor: pointer;
			}

			.hit:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 2px;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				--card: color-mix(in oklch, var(--paper) 50%, white);
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);

				html.dark & {
					--card: color-mix(in oklch, var(--paper) 88%, var(--yellow));
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
				}
			}

			.box-paper {
				fill: var(--paper);
			}

			.card-paper {
				fill: var(--card);
			}

			.tray {
				fill: color-mix(in oklch, var(--ink) 18%, var(--paper));
			}

			.jar-ink {
				fill: var(--ink);
			}

			.faint {
				opacity: 0.3;
			}

			.soft {
				opacity: 0.5;
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.deep {
				stroke: var(--shade-ink);
			}

			.shadow-wash {
				fill: var(--shade);
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: screen;
				}
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0;
			}

			.plate-text,
			.button-text,
			.answer-text {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
				font-weight: 800;
			}

			.plate-text {
				font-size: 10px;
			}

			.button-text {
				font-size: 7px;
				text-anchor: middle;
			}

			.answer-text {
				font-size: 9px;
			}

			.answer,
			.coin {
				opacity: 0;
			}

			.scene[data-pressed='POST'] .coin {
				opacity: 1;
			}

			.press {
				transition: translate 120ms ease;
			}

			.frame:has(.get-hit:hover) .get,
			.frame:has(.get-hit:focus-visible) .get,
			.frame:has(.post-hit:hover) .post,
			.frame:has(.post-hit:focus-visible) .post {
				translate: 0 -3px;
			}

			.method-part {
				text-decoration: underline 0 transparent;
				transition: text-decoration-color 120ms ease;
			}

			.frame:has(.get-hit:hover) .method-part,
			.frame:has(.post-hit:hover) .method-part,
			.scene[data-pressed='POST'] .method-part,
			.scene[data-pressed='GET'] .method-part {
				text-decoration: underline 1.4px color-mix(in srgb, var(--pink) 70%, #e0603c);
				text-underline-offset: 2px;
			}

			.cup {
				fill: color-mix(in oklch, var(--ink) 18%, var(--paper));
			}

			.coin-paper {
				fill: oklch(80% 0.07 85);
			}

			.scene[data-pressed='GET'] .answer {
				opacity: 1;
			}

			.scene[data-pressed='GET'] .get .pink,
			.scene[data-pressed='POST'] .post .pink {
				opacity: 0.6;
			}

			.scene[data-beat='odd'] {
				--sink: sink-a;
				--drop: drop-a;
				--rattle: rattle-a;
			}

			.scene[data-beat='even'] {
				--sink: sink-b;
				--drop: drop-b;
				--rattle: rattle-b;
			}

			.scene[data-pressed='GET']:not([data-beat='rest']) .get,
			.scene[data-pressed='POST']:not([data-beat='rest']) .post {
				animation: var(--sink) 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.scene[data-pressed='GET']:not([data-beat='rest']) .answer {
				animation: var(--drop) 700ms 400ms ease-in both;
			}

			.scene[data-pressed='POST']:not([data-beat='rest']) .coin {
				animation: var(--rattle) 700ms 300ms ease-out both;
			}

			@keyframes rattle-a {
				0% {
					opacity: 0;
					transform: translateY(-14px);
				}
				30% {
					opacity: 1;
					transform: none;
				}
				45% {
					transform: rotate(-14deg);
				}
				60% {
					transform: rotate(10deg);
				}
				75% {
					transform: rotate(-6deg);
				}
				100% {
					opacity: 1;
					transform: none;
				}
			}

			@keyframes rattle-b {
				0% {
					opacity: 0;
					transform: translateY(-14px);
				}
				30% {
					opacity: 1;
					transform: none;
				}
				45% {
					transform: rotate(-14deg);
				}
				60% {
					transform: rotate(10deg);
				}
				75% {
					transform: rotate(-6deg);
				}
				100% {
					opacity: 1;
					transform: none;
				}
			}

			@keyframes sink-a {
				40% {
					transform: translate(var(--sink-x), var(--sink-y));
				}
			}

			@keyframes sink-b {
				40% {
					transform: translate(var(--sink-x), var(--sink-y));
				}
			}

			@keyframes drop-a {
				from {
					opacity: 0;
					transform: translate(var(--drop-x), var(--drop-y));
				}
				30% {
					opacity: 1;
				}
				to {
					opacity: 1;
					transform: none;
				}
			}

			@keyframes drop-b {
				from {
					opacity: 0;
					transform: translate(var(--drop-x), var(--drop-y));
				}
				30% {
					opacity: 1;
				}
				to {
					opacity: 1;
					transform: none;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene * {
					animation: none !important;
					transition: none !important;
				}
			}

			.sr {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}
		</style>
	</figure>
}
