// A browser window with a sign-up form and a preventDefault() switch: off, Join spins the reload arrow and the email is lost; on, the email joins the list.
import { computed, state } from '@markless/core';
import { describeSubmit, describeSwitch, EMAILS, flip, nextEmail, SHOWN } from './form-model.ts';
import { art } from './form.art.ts';

export default function FormAnatomy() @{
	let draft = state<string>(EMAILS[0]);
	let joined = state<string[]>([]);
	let prevent = state(true);
	let spin = state('rest');
	let drop = state('rest');
	let shake = state('rest');
	let said = state('');
	const knob = computed(() => 'transform: translate(' + (prevent ? art.toggle.onX : art.toggle.offX) + 'px, ' + art.toggle.cy + 'px)');
	const shown = computed(() => joined.slice(-SHOWN).reverse());
	function submit() {
		said = describeSubmit(prevent, draft);
		if (draft === '') {
			shake = flip(shake);
			return;
		}
		if (prevent) {
			joined.push(draft);
			drop = flip(drop);
		} else {
			spin = flip(spin);
			joined = [];
		}
		draft = '';
	}
	function type() {
		draft = nextEmail(joined);
		said = 'Typed ' + draft + '.';
	}
	function toggle() {
		prevent = !prevent;
		said = describeSwitch(prevent);
	}

	<figure class="anatomy form">
		<svg class="scene" data-spin={spin} data-drop={drop} data-shake={shake} viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="a browser window with a sign-up form, and a switch for event.preventDefault()">
			<path class="shadow" d={art.window.shadow} />
			<path class="hatch" d={art.window.shadowHatch} />
			<path class="paper" d={art.window.frame} />
			<path class="bar" d={art.window.bar} />
			<path class="field-fill" d={art.window.address} />
			<path class="ink" d={art.window.ink} />
			<text class="address" x={art.window.addressX} y={art.window.addressY}>example.com/join</text>
			<g class="reload">
				<path class="ink" d={art.reload.ink} />
			</g>
			<g class="page">
				<text class="label" x={art.field.x} y={art.field.y - 10}>Email</text>
				<g
					class="field"
					tabindex="0"
					role="button"
					aria-label={draft === '' ? 'email box, empty. Press to type an email.' : 'email box: ' + draft + '. Press to type another.'}
					onClick={type}
					onKeyDown={(event) => {
						if (event.key !== 'Enter' && event.key !== ' ') return;
						event.preventDefault();
						type();
					}}
				>
					<path class="field-fill" d={art.form.field} />
					<path class="ink" d={art.form.fieldInk} />
					<text class="typed" x={art.field.x + 12} y={art.field.y + 28}>{draft === '' ? 'click to type' : draft}</text>
				</g>
				<g
					class="join"
					tabindex="0"
					role="button"
					aria-label="Join: submit the form"
					onClick={submit}
					onKeyDown={(event) => {
						if (event.key !== 'Enter' && event.key !== ' ') return;
						event.preventDefault();
						submit();
					}}
				>
					<path class="button-fill" d={art.form.button} />
					<path class="hatch" d={art.form.buttonShade} />
					<path class="ink" d={art.form.buttonInk} />
					<text class="button-text" x={art.button.x + art.button.w / 2} y={art.button.y + 28}>Join</text>
				</g>
				<text class="label" x={art.field.x} y="190">Joined</text>
				<path class="ink faint" d={art.form.listRule} />
				<text class="entry newest" x={art.field.x} y="228">{shown[0] ?? ''}</text>
				<text class="entry" x={art.field.x} y="256">{shown[1] ?? ''}</text>
				<text class="entry" x={art.field.x} y="284">{shown[2] ?? ''}</text>
			</g>
			<g
				class={prevent ? 'switch on' : 'switch'}
				tabindex="0"
				role="switch"
				aria-checked={prevent ? 'true' : 'false'}
				aria-label="event.preventDefault()"
				onClick={toggle}
				onKeyDown={(event) => {
					if (event.key !== 'Enter' && event.key !== ' ') return;
					event.preventDefault();
					toggle();
				}}
			>
				<text class="code" x={art.toggle.labelX} y={art.switchBox.y - 34}>event.</text>
				<text class="code" x={art.toggle.labelX} y={art.switchBox.y - 12}>preventDefault()</text>
				<path class="track" d={art.toggle.track} />
				<path class="ink desk" d={art.toggle.ink} />
				<g class="knob" style={knob}>
					<path class="knob-fill" d={art.toggle.knob} />
					<path class="ink" d={art.toggle.knobInk} />
				</g>
				<text class="state" x={art.toggle.labelX} y={art.switchBox.y + art.switchBox.h + 30}>{prevent ? 'on' : 'off'}</text>
			</g>
		</svg>
		<figcaption class="sr">
			An ink drawing of a browser window with a sign-up form: an email box, a Join button and a list of who joined. Beside it is a switch
			labelled event.preventDefault(). With the switch on, Join adds the email to the list and the page stays. With it off, Join spins the
			reload arrow, the page reloads, and the typed email and the list are gone. Press the email box to type a sample email.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.form {
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
				--hot: oklch(70% 0.17 60);
				--go: oklch(62% 0.14 150);

				html.dark & {
					--sheet: var(--figure-sheet);
				}
			}

			html.dark .scene {
				--light-sheet: color-mix(in oklch, var(--cream) 55%, white);

				.button-fill {
					fill: color-mix(in oklch, var(--light-sheet) 60%, var(--go));
				}

				.on .track {
					fill: color-mix(in oklch, var(--light-sheet) 50%, var(--go));
				}

				.field-fill,
				.field:hover .field-fill,
				.field:focus-visible .field-fill {
					fill: var(--slab);
				}

				.button-text {
					fill: var(--on-accent);
				}

				.join .hatch {
					stroke: var(--on-accent);
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
			}

			.faint {
				opacity: 0.4;
			}

			.paper {
				fill: var(--sheet);
			}

			.bar {
				fill: color-mix(in oklch, var(--sheet) 85%, var(--ink));
			}

			.field-fill {
				fill: color-mix(in oklch, var(--sheet) 70%, white);
			}

			.button-fill {
				fill: color-mix(in oklch, var(--sheet) 60%, var(--go));
			}

			.track {
				fill: color-mix(in oklch, var(--sheet) 85%, var(--ink));
				transition: fill 200ms ease;
			}

			.on .track {
				fill: color-mix(in oklch, var(--sheet) 50%, var(--go));
			}

			.knob-fill {
				fill: var(--sheet);
			}

			.knob {
				transition: transform 200ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.address,
			.label,
			.typed,
			.button-text,
			.entry,
			.code,
			.state {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--ink);
			}

			.address {
				font-size: 13px;
				opacity: 0.7;
			}

			.label {
				font-size: 15px;
				font-weight: 700;
			}

			.typed {
				font-size: 18px;
			}

			.button-text {
				font-size: 20px;
				font-weight: 800;
				text-anchor: middle;
			}

			.entry {
				font-size: 18px;
			}

			.code {
				font-family: var(--font-mono, ui-monospace, monospace);
				font-size: 15px;
				text-anchor: middle;
			}

			.state {
				font-size: 18px;
				font-weight: 800;
				text-anchor: middle;
			}

			.field,
			.join,
			.switch {
				cursor: pointer;
				outline: none;
			}

			.field:hover .field-fill,
			.field:focus-visible .field-fill {
				fill: white;
			}

			.join {
				transform-box: fill-box;
				transform-origin: center;
				transition: transform 120ms ease;
			}

			.join:hover,
			.join:focus-visible {
				transform: translateY(-2px);
			}

			.join:active {
				transform: translateY(1px);
			}

			:is(.field, .join, .switch):focus-visible :is(.field-fill, .button-fill, .track) {
				stroke: var(--ink);
				stroke-dasharray: 4 4;
				stroke-width: 1.4;
			}

			.reload {
				transform-box: fill-box;
				transform-origin: center;
			}

			.scene[data-spin='odd'] .reload {
				animation: spin-a 700ms ease-in-out;
			}

			.scene[data-spin='even'] .reload {
				animation: spin-b 700ms ease-in-out;
			}

			.scene[data-spin='odd'] .page {
				animation: blank-a 700ms ease-in-out;
			}

			.scene[data-spin='even'] .page {
				animation: blank-b 700ms ease-in-out;
			}

			.scene[data-drop='odd'] .newest {
				animation: drop-a 500ms cubic-bezier(0.3, 0.7, 0.4, 1.3);
			}

			.scene[data-drop='even'] .newest {
				animation: drop-b 500ms cubic-bezier(0.3, 0.7, 0.4, 1.3);
			}

			.scene[data-shake='odd'] .field {
				animation: refuse-a 420ms ease-in-out;
			}

			.scene[data-shake='even'] .field {
				animation: refuse-b 420ms ease-in-out;
			}

			@keyframes spin-a {
				to {
					transform: rotate(360deg);
				}
			}

			@keyframes spin-b {
				to {
					transform: rotate(360deg);
				}
			}

			@keyframes blank-a {
				35%,
				60% {
					opacity: 0;
				}
			}

			@keyframes blank-b {
				35%,
				60% {
					opacity: 0;
				}
			}

			@keyframes drop-a {
				from {
					opacity: 0;
					transform: translateY(-60px);
				}
			}

			@keyframes drop-b {
				from {
					opacity: 0;
					transform: translateY(-60px);
				}
			}

			@keyframes refuse-a {
				25% {
					transform: translateX(-6px);
				}

				55% {
					transform: translateX(5px);
				}
			}

			@keyframes refuse-b {
				25% {
					transform: translateX(-6px);
				}

				55% {
					transform: translateX(5px);
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
