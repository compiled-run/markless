// A weather card: the first forecast waits in pencil, a new city keeps the old forecast until its own lands, and an answer that comes back after a newer pick is thrown away.
import { computed, state } from '@markless/core';
import { CITIES, claim, degrees, describeWeather, isNewest, WAIT_MS } from './weather-model.ts';
import { art } from './weather.art.ts';

export default function WeatherAnatomy() @{
	let shown = state(-1);
	let picked = state(0);
	let waiting = state(true);
	let dropped = state('');
	let dropBeat = state('rest');
	let said = state('');
	let touched = state(false);
	let hovering = state(false);
	const stage = computed(() => (waiting ? (shown < 0 ? 'first' : 'refresh') : 'landed'));
	const sky = computed((): string => (shown < 0 ? '' : CITIES[shown]!.sky));
	const temp = computed(() => (shown < 0 ? '' : degrees(CITIES[shown]!.temp)));
	const city = computed(() => (shown < 0 ? '' : CITIES[shown]!.name));
	const day0Sky = computed((): string => (shown < 0 ? '' : CITIES[shown]!.days[0]![1]));
	const day0Name = computed(() => CITIES[shown < 0 ? 0 : shown]!.days[0]![0]);
	const day0Temp = computed(() => (shown < 0 ? '' : degrees(CITIES[shown]!.days[0]![2])));
	const day1Sky = computed((): string => (shown < 0 ? '' : CITIES[shown]!.days[1]![1]));
	const day1Name = computed(() => CITIES[shown < 0 ? 0 : shown]!.days[1]![0]);
	const day1Temp = computed(() => (shown < 0 ? '' : degrees(CITIES[shown]!.days[1]![2])));
	const day2Sky = computed((): string => (shown < 0 ? '' : CITIES[shown]!.days[2]![1]));
	const day2Name = computed(() => CITIES[shown < 0 ? 0 : shown]!.days[2]![0]);
	const day2Temp = computed(() => (shown < 0 ? '' : degrees(CITIES[shown]!.days[2]![2])));
	const pick = (index: number) => {
		const mine = claim();
		picked = index;
		waiting = true;
		said = describeWeather('asked', CITIES[index]!.name);
		setTimeout(() => {
			if (isNewest(mine)) {
				shown = index;
				waiting = false;
				said = describeWeather('landed', CITIES[index]!.name);
			} else {
				dropped = CITIES[index]!.name + ' ' + degrees(CITIES[index]!.temp);
				dropBeat = dropBeat === 'odd' ? 'even' : 'odd';
				said = describeWeather('dropped', CITIES[index]!.name);
			}
		}, WAIT_MS);
	};

	const touch = (index: number) => {
		touched = true;
		pick(index);
	};

	<figure
		class="anatomy weather"
		onVisible={() => {
			if (!touched) pick(0);
		}}
	>
		<svg class="scene" data-stage={stage} data-drop={dropBeat} viewBox={'0 0 ' + art.width + ' ' + art.height} role="tablist" aria-label="Pick a city">
			<path class="shadow" d={art.card.shadow} />
			<path class="hatch" d={art.card.shadowHatch} />
			<g
				class={picked === 0 ? 'tab on' : 'tab'}
				tabindex={picked === 0 ? 0 : -1}
				role="tab"
				aria-selected={picked === 0}
				onClick={() => touch(0)}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') event.preventDefault();if (event.key === 'ArrowRight') touch((0 + 1) % 3);
					else if (event.key === 'ArrowLeft') touch((0 + 2) % 3);
					else if (event.key === 'Enter' || event.key === ' ') touch(0);
					else return;
				}}
			>
				<path class="tab-paper" d={art.tabs[0].paper} />
				<path class="hatch light" d={art.tabs[0].hatch} />
				<path class="ink" d={art.tabs[0].ink} />
				<text class="tab-name" x="86" y="44">Oslo</text>
			</g>
			<g
				class={picked === 1 ? 'tab on' : 'tab'}
				tabindex={picked === 1 ? 0 : -1}
				role="tab"
				aria-selected={picked === 1}
				onClick={() => touch(1)}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') event.preventDefault();if (event.key === 'ArrowRight') touch((1 + 1) % 3);
					else if (event.key === 'ArrowLeft') touch((1 + 2) % 3);
					else if (event.key === 'Enter' || event.key === ' ') touch(1);
					else return;
				}}
			>
				<path class="tab-paper" d={art.tabs[1].paper} />
				<path class="hatch light" d={art.tabs[1].hatch} />
				<path class="ink" d={art.tabs[1].ink} />
				<text class="tab-name" x="206" y="44">Lisbon</text>
			</g>
			<g
				class={picked === 2 ? 'tab on' : 'tab'}
				tabindex={picked === 2 ? 0 : -1}
				role="tab"
				aria-selected={picked === 2}
				onClick={() => touch(2)}
				onKeyDown={(event) => {
					if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') event.preventDefault();if (event.key === 'ArrowRight') touch((2 + 1) % 3);
					else if (event.key === 'ArrowLeft') touch((2 + 2) % 3);
					else if (event.key === 'Enter' || event.key === ' ') touch(2);
					else return;
				}}
			>
				<path class="tab-paper" d={art.tabs[2].paper} />
				<path class="hatch light" d={art.tabs[2].hatch} />
				<path class="ink" d={art.tabs[2].ink} />
				<text class="tab-name" x="326" y="44">Tokyo</text>
			</g>
			<path class="paper" d={art.card.paper} />
			<path class="ink inked" d={art.card.ink} />
			<path class="pencil" d={art.card.pencil} />
			<g class="today">
					<g class={sky === 'sun' ? 'icon on' : 'icon'}>
						<path class="wash sunwash" d={art.big.sun.wash} />
						<path class="hatch" d={art.big.sun.shade} />
						<path class="ink" d={art.big.sun.ink} />
					</g>
					<g class={sky === 'cloud' ? 'icon on' : 'icon'}>
						<path class="wash cloudwash" d={art.big.cloud.wash} />
						<path class="hatch" d={art.big.cloud.shade} />
						<path class="ink" d={art.big.cloud.ink} />
					</g>
					<g class={sky === 'rain' ? 'icon on' : 'icon'}>
						<path class="wash cloudwash" d={art.big.rain.wash} />
						<path class="hatch" d={art.big.rain.shade} />
						<path class="ink" d={art.big.rain.ink} />
					</g>
				<text class="city" x="190" y="120">{city}</text>
				<text class="num temp" x="190" y="186">{temp}</text>
				<g
					class="pending"
					onPointerEnter={() => {
						hovering = true;
					}}
					onPointerLeave={() => {
						hovering = false;
					}}
				>
					<rect class="hit" x="180" y="130" width="150" height="70" />
					<text class="pencil-dots big" x="190" y="186">…</text>
				</g>
			</g>
				<g class="day">
					<g class={day0Sky === 'sun' ? 'icon on' : 'icon'}>
						<path class="wash sunwash" d={art.small[0].sun.wash} />
						<path class="hatch" d={art.small[0].sun.shade} />
						<path class="ink" d={art.small[0].sun.ink} />
					</g>
					<g class={day0Sky === 'cloud' ? 'icon on' : 'icon'}>
						<path class="wash cloudwash" d={art.small[0].cloud.wash} />
						<path class="hatch" d={art.small[0].cloud.shade} />
						<path class="ink" d={art.small[0].cloud.ink} />
					</g>
					<g class={day0Sky === 'rain' ? 'icon on' : 'icon'}>
						<path class="wash cloudwash" d={art.small[0].rain.wash} />
						<path class="hatch" d={art.small[0].rain.shade} />
						<path class="ink" d={art.small[0].rain.ink} />
					</g>
					<text class="day-name" x="78" y="268">{day0Name}</text>
					<text class="num day-temp" x="184" y="268">{day0Temp}</text>
					<text class="pencil-dots" x="184" y="268">…</text>
				</g>
				<g class="day">
					<g class={day1Sky === 'sun' ? 'icon on' : 'icon'}>
						<path class="wash sunwash" d={art.small[1].sun.wash} />
						<path class="hatch" d={art.small[1].sun.shade} />
						<path class="ink" d={art.small[1].sun.ink} />
					</g>
					<g class={day1Sky === 'cloud' ? 'icon on' : 'icon'}>
						<path class="wash cloudwash" d={art.small[1].cloud.wash} />
						<path class="hatch" d={art.small[1].cloud.shade} />
						<path class="ink" d={art.small[1].cloud.ink} />
					</g>
					<g class={day1Sky === 'rain' ? 'icon on' : 'icon'}>
						<path class="wash cloudwash" d={art.small[1].rain.wash} />
						<path class="hatch" d={art.small[1].rain.shade} />
						<path class="ink" d={art.small[1].rain.ink} />
					</g>
					<text class="day-name" x="238" y="268">{day1Name}</text>
					<text class="num day-temp" x="344" y="268">{day1Temp}</text>
					<text class="pencil-dots" x="344" y="268">…</text>
				</g>
				<g class="day">
					<g class={day2Sky === 'sun' ? 'icon on' : 'icon'}>
						<path class="wash sunwash" d={art.small[2].sun.wash} />
						<path class="hatch" d={art.small[2].sun.shade} />
						<path class="ink" d={art.small[2].sun.ink} />
					</g>
					<g class={day2Sky === 'cloud' ? 'icon on' : 'icon'}>
						<path class="wash cloudwash" d={art.small[2].cloud.wash} />
						<path class="hatch" d={art.small[2].cloud.shade} />
						<path class="ink" d={art.small[2].cloud.ink} />
					</g>
					<g class={day2Sky === 'rain' ? 'icon on' : 'icon'}>
						<path class="wash cloudwash" d={art.small[2].rain.wash} />
						<path class="hatch" d={art.small[2].rain.shade} />
						<path class="ink" d={art.small[2].rain.ink} />
					</g>
					<text class="day-name" x="398" y="268">{day2Name}</text>
					<text class="num day-temp" x="504" y="268">{day2Temp}</text>
					<text class="pencil-dots" x="504" y="268">…</text>
				</g>
			<g class="spinner">
				<path d="M548 82 a12 12 0 1 1 -8 -11" />
			</g>
			<g class="ghost">
				<text class="ghost-text" x="420" y="140">{dropped}</text>
				<path class="ghost-strike" d="M412 134 L 560 128" />
			</g>
		</svg>
		<p class={hovering && shown < 0 ? 'hover-line on' : 'hover-line'} aria-hidden="true">
			this pencil is <code>@pending</code>
		</p>
		<figcaption class="sr">
			An ink drawing of a weather card with three city tabs: Oslo, Lisbon and Tokyo. At first the card is only pencilled in, with pencil
			dots where the numbers go, until Oslo's forecast is inked in. Pick another city: the old forecast stays, a little faded, with a
			small pencil spinner, until the new forecast lands. Pick two cities quickly: the first answer comes back, is struck through and
			drops away, and only the last city's forecast is shown.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.weather {
				margin: var(--space-m) 0;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				user-select: none;
				--shade: color-mix(in oklch, var(--ink) 20%, transparent);
				--sheet: color-mix(in oklch, var(--paper) 55%, white);
				--pencil: color-mix(in oklch, var(--ink) 40%, var(--sheet));

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 92%, var(--yellow));
				}
			}

			.shadow {
				fill: var(--shade);
			}

			.paper,
			.tab-paper {
				fill: var(--sheet);
			}

			.tab {
				cursor: pointer;
				outline: none;
				transition: transform 160ms ease;
			}

			.tab:hover,
			.tab:focus-visible {
				transform: translateY(-4px);
			}

			.tab.on .tab-paper {
				fill: color-mix(in oklch, var(--yellow) 45%, var(--sheet));
			}

			.ink {
				fill: var(--ink);
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.45;
			}

			.light {
				opacity: 0.25;
			}

			.pencil {
				fill: var(--pencil);
				opacity: 0;
			}

			.wash {
				mix-blend-mode: multiply;
				opacity: 0.8;

				html.dark & {
					mix-blend-mode: normal;
					opacity: 0.45;
				}
			}

			.sunwash {
				fill: var(--yellow);
			}

			.cloudwash {
				fill: oklch(80% 0.03 240);
			}

			.icon {
				opacity: 0;
				transition: opacity 300ms ease;
			}

			.icon.on {
				opacity: 1;
			}

			.city,
			.num,
			.tab-name,
			.day-name,
			.ghost-text,
			.pencil-dots {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);

				html.dark & {
					fill: var(--paper);
				}
			}

			.tab-name {
				font-size: 18px;
				font-weight: 800;
				text-anchor: middle;
			}

			.city {
				font-size: 26px;
				font-weight: 800;
			}

			.temp {
				font-size: 64px;
				font-weight: 800;
			}

			.day-name {
				font-size: 18px;
				font-weight: 700;
			}

			.day-temp {
				font-size: 22px;
				font-weight: 800;
			}

			.pencil-dots {
				font-size: 26px;
				font-style: italic;
				fill: var(--pencil);
				opacity: 0;
			}

			.big {
				font-size: 56px;
			}

			.pending {
				cursor: help;
			}

			.scene[data-stage='first'] .inked,
			.scene[data-stage='first'] .num {
				opacity: 0;
			}

			.scene[data-stage='first'] .pencil {
				opacity: 1;
			}

			.scene[data-stage='first'] .pencil-dots {
				opacity: 1;
				animation: smudge 1.1s ease-in-out infinite alternate;
			}

			.hit {
				fill: transparent;
			}

			.hover-line {
				min-height: 1.5em;
				margin: 0.2rem 0 0;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-style: italic;
				text-align: center;
				opacity: 0;
				transition: opacity 150ms ease;
			}

			.hover-line.on {
				opacity: 0.75;
			}

			.scene[data-stage='refresh'] .today,
			.scene[data-stage='refresh'] .day {
				opacity: 0.45;
				transition: opacity 200ms ease;
			}

			.spinner {
				opacity: 0;
				transform-box: fill-box;
				transform-origin: center;
			}

			.spinner path {
				fill: none;
				stroke: var(--pencil);
				stroke-width: 2.4;
				stroke-linecap: round;
			}

			.scene[data-stage='refresh'] .spinner {
				opacity: 1;
				animation: spin 900ms linear infinite;
			}

			.scene[data-stage='landed'] .num {
				animation: ink 700ms ease-out;
			}

			.ghost {
				opacity: 0;
			}

			.ghost-text {
				font-size: 24px;
				font-weight: 800;
			}

			.ghost-strike {
				fill: none;
				stroke: var(--pencil);
				stroke-width: 3;
				stroke-linecap: round;
			}

			.scene[data-drop='odd'] .ghost {
				animation: drop-a 1600ms ease-in both;
			}

			.scene[data-drop='even'] .ghost {
				animation: drop-b 1600ms ease-in both;
			}

			@keyframes drop-a {
				0%,
				45% {
					opacity: 0.9;
					transform: none;
				}

				100% {
					opacity: 0;
					transform: translate(30px, 160px) rotate(18deg);
				}
			}

			@keyframes drop-b {
				0%,
				45% {
					opacity: 0.9;
					transform: none;
				}

				100% {
					opacity: 0;
					transform: translate(30px, 160px) rotate(18deg);
				}
			}

			@keyframes smudge {
				to {
					opacity: 0.35;
				}
			}

			@keyframes spin {
				to {
					transform: rotate(360deg);
				}
			}

			@keyframes ink {
				from {
					fill-opacity: 0.15;
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
