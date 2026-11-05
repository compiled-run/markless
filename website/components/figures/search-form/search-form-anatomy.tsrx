// An inked search form whose input and button are real: the button reaches the input through the handle field.
import { element, state } from '@markless/core';
import { BUTTON, CALL, describePress, describeToggle, GONE, HANDLE } from './model.ts';
import { art } from './search-form.art.ts';

export default function SearchFormAnatomy() @{
	const searchInput = element<HTMLInputElement>();
	let present = state(true);
	let focused = state(false);
	let hint = state('');
	let beat = state('rest');
	let touched = state(false);
	let said = state('');

	<figure
		class="anatomy"
		data-present={present ? 'yes' : 'no'}
		data-focused={focused ? 'yes' : 'no'}
		data-hint={hint}
		data-beat={beat}
		data-touched={touched ? 'yes' : 'no'}
		onKeyDown={(event) => {
			if (event.key === 'Escape') {
				touched = true;
				present = true;
				beat = 'rest';
				if (searchInput) searchInput.value = '';
				said = describeToggle(true);
			}
		}}
	>
		<div class="stage">
			<svg class="scene" viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="hatch light" d={art.card.shadow} />
				<path class="paper" d={art.card.paper} />
				<path class="ink" d={art.card.ink} />
				<path class="ink faint" d={art.card.rule} />

				<path class="ghost" d={art.input.ghost} />
				<g class="field-box">
					<path class="wash yellow ring-wash" d={art.input.ringWash} />
					<path class="paper" d={art.input.paper} />
					<path class="hatch faint" d={art.input.inset} />
					<path class="ink" d={art.input.ink} />
					<path class="ink faint" d={art.input.lens} />
					<path class="ink ring" d={art.input.ring} />
				</g>

				<path class="ink side" d={art.button.side} />
				<path class="hatch" d={art.button.sideHatch} />
				<g class="press">
					<path class="paper" d={art.button.paper} />
					<path class="wash pink" d={art.button.wash} />
					<path class="ink" d={art.button.ink} />
				</g>

				<g class="handle whole">
					<path class="pencil-ink" d={art.line.whole} />
					<text class="code label" x={art.line.label.x} y={art.line.label.y}>{HANDLE}</text>
				</g>
				<g class="handle loose">
					<path class="pencil-ink" d={art.line.loose} />
					<text class="code" x={art.line.looseLabel.x} y={art.line.looseLabel.y}>{HANDLE}</text>
					<text class="code gone" x={art.line.gone.x} y={art.line.gone.y}>{GONE}</text>
				</g>

				<path class="track" d={art.toggle.track} />
				<path class="ink" d={art.toggle.trackInk} />
				<g class="knob">
					<path class="paper" d={art.toggle.knob} />
					<path class="ink" d={art.toggle.knobInk} />
				</g>
			</svg>
			<input
				el={searchInput}
				class="real-input"
				type="search"
				aria-label="Search"
				style={art.overlay.input}
				onFocus={() => {
					focused = true;
					hint = 'input';
				}}
				onBlur={() => {
					focused = false;
					hint = '';
				}}
				onPointerenter={() => {
					hint = 'input';
				}}
				onPointerleave={() => {
					hint = '';
				}}
			/>
			<button
				type="button"
				class="real-button"
				style={art.overlay.button}
				onPointerenter={() => {
					hint = 'button';
				}}
				onPointerleave={() => {
					hint = '';
				}}
				onFocus={() => {
					hint = 'button';
				}}
				onBlur={() => {
					hint = '';
				}}
				onClick={() => {
					touched = true;
					beat = beat === 'odd' ? 'even' : 'odd';
					if (present) searchInput?.focus();
					said = describePress(present);
				}}
			>
				{BUTTON}
			</button>
			<button
				type="button"
				class="real-toggle"
				role="switch"
				aria-checked={present ? 'true' : 'false'}
				aria-label="The input is on the page"
				style={art.overlay.toggle}
				onClick={() => {
					touched = true;
					present = !present;
					beat = 'rest';
					said = describeToggle(present);
				}}
			></button>
		</div>
		<p class="caption" aria-hidden="true">
			<span class="cap cap-input">{HANDLE}</span>
			<span class="cap cap-button">{CALL}</span>
		</p>
		<figcaption class="sr">
			An inked search form: a real text input and a real {BUTTON} button. A dotted pencil line named {HANDLE} runs from the button to the
			input. Press the button and the cursor blinks in the input. Type in it, it is a real input. The small switch under the input takes it
			off the page: then the line dangles to {GONE}, and pressing the button focuses nothing. Escape puts the input back.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
			}

			.stage {
				position: relative;
				container-type: inline-size;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--field: color-mix(in oklch, var(--paper) 20%, white);
				--text: var(--ink);
				--pencil: color-mix(in oklch, var(--ink) 72%, var(--paper));

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--field: color-mix(in oklch, var(--ink) 97%, white);
					--text: var(--paper);
					--pencil: color-mix(in oklch, var(--paper) 72%, var(--ink));
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.field-box .paper {
				fill: var(--field);
			}

			.ink {
				fill: var(--text);
			}

			.faint {
				opacity: 0.4;
			}

			.hatch {
				fill: none;
				stroke: var(--text);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.45;

				html.dark & {
					stroke: black;
					opacity: 0.6;
				}
			}

			.wash {
				mix-blend-mode: multiply;
			}

			.pink {
				fill: var(--pink);
				opacity: 0.55;
			}

			.yellow {
				fill: var(--yellow);
				opacity: 0;
			}

			.track {
				fill: color-mix(in oklch, var(--yellow) 70%, var(--sheet));
			}

			.anatomy[data-present='no'] .track {
				fill: var(--sheet);
			}

			.knob {
				transition: transform 180ms ease;
			}

			.anatomy[data-present='yes'] .knob {
				transform: translateX(26px);
			}

			.pencil-ink {
				fill: var(--pencil);
			}

			.code {
				font-family: var(--font-mono, ui-monospace, monospace);
				font-size: 15px;
				font-weight: 700;
				fill: var(--pencil);
			}

			.label {
				text-anchor: middle;
			}

			.caption {
				position: relative;
				height: 1.6em;
				margin: 0.2rem 0 0;
				text-align: center;
				font-family: var(--font-mono, ui-monospace, monospace);
				font-weight: 700;
				color: var(--ink);
			}

			.cap {
				position: absolute;
				inset: 0;
				opacity: 0;
				transition: opacity 140ms ease;
			}

			.anatomy[data-hint='input'] .cap-input,
			.anatomy[data-hint='button'] .cap-button {
				opacity: 1;
			}

			.gone {
				font-size: 16px;
				text-anchor: end;
			}

			.ring {
				opacity: 0;
			}

			.ghost {
				fill: none;
				stroke: var(--pencil);
				stroke-width: 1.2;
				stroke-dasharray: 5 6;
				opacity: 0;
			}

			.handle.loose,
			.anatomy[data-present='no'] .handle.whole,
			.anatomy[data-present='no'] .field-box {
				opacity: 0;
			}

			.anatomy[data-present='no'] .handle.loose,
			.anatomy[data-present='no'] .ghost {
				opacity: 1;
			}

			.anatomy[data-present='yes'][data-focused='yes'] .ring {
				opacity: 1;
			}

			.anatomy[data-present='yes'][data-focused='yes'] .ring-wash {
				opacity: 0.75;
			}

						.anatomy[data-hint='input'] .handle .label {
				fill: var(--text);
			}

			.anatomy[data-hint='input'] .field-box .ink {
				stroke: var(--text);
				stroke-width: 0.6;
			}

			.press {
				transform-box: fill-box;
				transform-origin: center;
			}

			.anatomy[data-touched='no'] .pink {
				animation: hint 2600ms ease-in-out infinite;
			}

			.anatomy[data-beat='odd'] .press {
				animation: sink-a 300ms ease-out;
			}

			.anatomy[data-beat='even'] .press {
				animation: sink-b 300ms ease-out;
			}

			.anatomy[data-present='no'][data-beat='odd'] .loose,
			.anatomy[data-present='no'][data-beat='even'] .loose {
				animation: dangle 600ms ease-out;
			}

			@keyframes hint {
				50% {
					opacity: 0.9;
				}
			}

			@keyframes sink-a {
				40% {
					transform: translate(2px, 3px);
				}
			}

			@keyframes sink-b {
				40% {
					transform: translate(2px, 3px);
				}
			}

			@keyframes dangle {
				25% {
					transform: rotate(-2deg);
				}
				60% {
					transform: rotate(1.5deg);
				}
			}

			.loose {
				transform-box: fill-box;
				transform-origin: right top;
			}

			.real-input,
			.real-button,
			.real-toggle {
				position: absolute;
				box-sizing: border-box;
				margin: 0;
				border: 0;
				border-radius: 1.4cqw;
				background: transparent;
				color: var(--ink);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				outline: none;
			}

			.real-input {
				padding: 0 9cqw 0 2.6cqw;
				font-size: 3.6cqw;
				caret-color: var(--ink);
				-webkit-appearance: none;
				appearance: none;

				html.dark & {
					color: var(--paper);
					caret-color: var(--paper);
				}
			}

			.real-input::-webkit-search-cancel-button {
				display: none;
			}

			.anatomy[data-present='no'] .real-input {
				display: none;
			}

			.real-button {
				font-size: 2.7cqw;
				font-weight: 700;
				white-space: nowrap;
				cursor: pointer;

				html.dark & {
					color: var(--paper);
				}
			}

			.real-button:focus-visible,
			.real-toggle:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 3px;
			}

			.real-toggle {
				cursor: pointer;
			}

			@media (prefers-reduced-motion: reduce) {
				.anatomy *,
				.anatomy .knob {
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
