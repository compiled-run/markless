// An ID card wired to a page, one wire per field: blow the birthday candle and only the age wire carries the change.
import { state } from '@markless/core';
import { describeChange, flip, nextName, PATHS, START } from './idcard-model.ts';
import { art } from './idcard.art.ts';

export default function IdCardAnatomy() @{
	let person = state<{ name: string; age: number }>({ name: START.name, age: START.age });
	let ageBeat = state('rest');
	let nameBeat = state('rest');
	let path = state('');
	let said = state('');
	function birthday() {
		person.age++;
		ageBeat = flip(ageBeat);
		said = describeChange('age', person.age);
	}
	function rename() {
		person.name = nextName(person.name);
		nameBeat = flip(nameBeat);
		said = describeChange('name', person.name);
	}

	<figure class="anatomy idcard">
		<svg class="scene" data-age={ageBeat} data-name={nameBeat} viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="an ID card whose name and age fields are each wired to a page">
			<g class="sheet">
				<path class="shadow" d={art.sheet.shadow} />
				<path class="hatch" d={art.sheet.shadowHatch} />
				<path class="paper" d={art.sheet.sheet} />
				<path class="ink" d={art.sheet.ink} />
				<text class="spot heading name-spot" x={art.spots.name.x} y={art.spots.name.y}>{person.name}</text>
				<text class="spot age-spot" x={art.spots.age.x} y={art.spots.age.y}>Age {person.age}</text>
			</g>
			<g class="card">
				<path class="shadow" d={art.card.shadow} />
				<path class="hatch" d={art.card.shadowHatch} />
				<path class="plastic" d={art.card.card} />
				<path class="band" d={art.card.band} />
				<path class="photo" d={art.card.photo} />
				<path class="hatch" d={art.card.photoHatch} />
				<path class="ink" d={art.card.ink} />
				<text class="title" x={art.card.titleX} y={art.card.titleY}>ID CARD</text>
			</g>
			<g
				class="field name-field"
				tabindex="0"
				role="button"
				aria-label={'name field, ' + person.name + '. Press to rename.'}
				onPointerEnter={() => (path = PATHS.name)}
				onPointerLeave={() => (path = '')}
				onFocus={() => (path = PATHS.name)}
				onBlur={() => (path = '')}
				onClick={rename}
				onKeyDown={(event) => {
					if (event.key !== 'Enter' && event.key !== ' ') return;
					event.preventDefault();
					rename();
				}}
			>
				<path class="box" d={art.card.fields[0]} />
				<path class="ink" d={art.card.fieldInk[0]} />
				<text class="key" x={art.fields.name.x + 10} y={art.fields.name.y + 26}>name</text>
				<text class="value" x={art.fields.name.x + 52} y={art.fields.name.y + 28}>{person.name}</text>
			</g>
			<g
				class="field age-field"
				tabindex="0"
				role="img"
				aria-label={'age field, ' + person.age}
				onPointerEnter={() => (path = PATHS.age)}
				onPointerLeave={() => (path = '')}
				onFocus={() => (path = PATHS.age)}
				onBlur={() => (path = '')}
			>
				<path class="box" d={art.card.fields[1]} />
				<path class="ink" d={art.card.fieldInk[1]} />
				<text class="key" x={art.fields.age.x + 10} y={art.fields.age.y + 26}>age</text>
				<text class="value" x={art.fields.age.x + 52} y={art.fields.age.y + 28}>{person.age}</text>
			</g>
			<g class="wire name-wire">
				<path class="ink desk" d={art.wires.name.ink} />
				<path class="ink desk" d={art.wires.name.plugs} />
				<path class="pulse" d={art.wires.name.path} />
			</g>
			<g class="wire age-wire">
				<path class="ink desk" d={art.wires.age.ink} />
				<path class="ink desk" d={art.wires.age.plugs} />
				<path class="pulse" d={art.wires.age.path} />
			</g>
			<g
				class="candle"
				tabindex="0"
				role="button"
				aria-label="Birthday: person.age++"
				onClick={birthday}
				onKeyDown={(event) => {
					if (event.key !== 'Enter' && event.key !== ' ') return;
					event.preventDefault();
					birthday();
				}}
			>
				<rect class="grab" x="120" y="222" width="80" height="100" />
				<path class="flame" d={art.candle.flame} />
				<path class="ink desk" d={art.candle.flameInk} />
				<path class="wax" d={art.candle.stick} />
				<path class="ink" d={art.candle.ink} />
				<text class="hint" x="186" y="296">birthday</text>
			</g>
		</svg>
		<p class="path" aria-hidden="true">{path === '' ? 'hover a field' : path}</p>
		<figcaption class="sr">
			An ink drawing of an ID card with a name field and an age field. Each field has its own wire to a small page that shows the name as
			a heading and the age below it. Press the birthday candle: only the age wire pulses and only the age on the page re-inks. Press the
			name field to rename the person: only the name wire pulses.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.idcard {
				margin: var(--space-m) 0;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				touch-action: pan-y;
				user-select: none;
				--shade: color-mix(in oklch, var(--ink) 20%, transparent);
				--sheet: color-mix(in oklch, var(--paper) 55%, white);
				--plastic: color-mix(in oklch, var(--paper) 70%, oklch(85% 0.05 230));
				--hot: oklch(70% 0.17 60);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 92%, var(--yellow));
					--plastic: color-mix(in oklch, var(--ink) 80%, oklch(60% 0.05 230));
				}
			}

			.shadow {
				fill: var(--shade);
			}

			.hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.45;
			}

			.ink {
				fill: var(--ink);

				html.dark &:not(.desk) {
					fill: var(--paper);
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.plastic {
				fill: var(--plastic);
			}

			.band {
				fill: color-mix(in oklch, var(--plastic) 70%, var(--ink));
			}

			.photo,
			.box {
				fill: var(--sheet);
			}

			.title,
			.key,
			.value,
			.spot,
			.hint {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
			}

			.title {
				font-size: 13px;
				font-weight: 800;
				letter-spacing: 0.2em;
				text-anchor: middle;
				fill: var(--paper);
			}

			.key {
				font-size: 13px;
				opacity: 0.75;
			}

			.value {
				font-size: 22px;
				font-weight: 700;
			}

			.spot {
				font-size: 24px;
			}

			.heading {
				font-size: 34px;
				font-weight: 800;
			}

			.hint {
				font-size: 15px;
				opacity: 0.7;
			}

			.field,
			.candle {
				outline: none;
				transform-box: fill-box;
				transform-origin: center;
				transition: transform 160ms ease;
			}

			.field:hover,
			.field:focus-visible {
				transform: translate(-2px, -3px);
			}

			.field:focus-visible .box,
			.candle:focus-visible .wax {
				stroke: var(--ink);
				stroke-dasharray: 4 4;
				stroke-width: 1.4;
			}

			.name-field,
			.candle {
				cursor: pointer;
			}

			.grab {
				fill: transparent;
			}

			.wax {
				fill: var(--sheet);
			}

			.flame {
				fill: var(--hot);
				transform-box: fill-box;
				transform-origin: 50% 100%;
			}

			.candle:hover .flame {
				transform: scale(1.15) rotate(-4deg);
			}

			.pulse {
				fill: none;
				stroke: var(--hot);
				stroke-width: 5;
				stroke-linecap: round;
				stroke-dasharray: 18 420;
				stroke-dashoffset: 18;
				opacity: 0;
			}

			.scene[data-age='odd'] .age-wire .pulse {
				animation: pulse-a 700ms ease-in;
			}

			.scene[data-age='even'] .age-wire .pulse {
				animation: pulse-b 700ms ease-in;
			}

			.scene[data-name='odd'] .name-wire .pulse {
				animation: pulse-a 700ms ease-in;
			}

			.scene[data-name='even'] .name-wire .pulse {
				animation: pulse-b 700ms ease-in;
			}

			.scene[data-age='odd'] .age-spot,
			.scene[data-name='odd'] .name-spot {
				animation: reink-a 500ms ease-out 600ms backwards;
			}

			.scene[data-age='even'] .age-spot,
			.scene[data-name='even'] .name-spot {
				animation: reink-b 500ms ease-out 600ms backwards;
			}

			.scene[data-age='odd'] .flame {
				animation: blow-a 700ms ease-out;
			}

			.scene[data-age='even'] .flame {
				animation: blow-b 700ms ease-out;
			}

			@keyframes pulse-a {
				0% {
					opacity: 1;
					stroke-dashoffset: 18;
				}

				100% {
					opacity: 1;
					stroke-dashoffset: -400;
				}
			}

			@keyframes pulse-b {
				0% {
					opacity: 1;
					stroke-dashoffset: 18;
				}

				100% {
					opacity: 1;
					stroke-dashoffset: -400;
				}
			}

			@keyframes reink-a {
				0% {
					opacity: 0.15;
				}
			}

			@keyframes reink-b {
				0% {
					opacity: 0.15;
				}
			}

			@keyframes blow-a {
				30% {
					transform: scale(0.4) skewX(-25deg);
				}
			}

			@keyframes blow-b {
				30% {
					transform: scale(0.4) skewX(-25deg);
				}
			}

			.path {
				margin: var(--space-2xs) 0 0;
				min-height: 1.5em;
				font-family: var(--font-mono, ui-monospace, monospace);
				font-size: 0.95rem;
				text-align: center;
				opacity: 0.8;
			}

			.key,
			.value,
			.spot {
				html.dark & {
					fill: var(--paper);
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
