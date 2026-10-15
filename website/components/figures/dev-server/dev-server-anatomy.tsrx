// The create figure's terminal sheet, where the reader types npm run dev; the browser sheet below it then shows the starter page, whose drawn Count button really counts.
import { computed, state } from '@markless/core';
import { COMMAND, describe, type Desk, enter, ghostFor, HEADING, HOST, LABEL, MAX_TYPED, PAGE_FILE, press, print, screen, START, TARGET, washFor } from './model.ts';
import { every, fieldIn, halt } from './play.ts';
import { art } from './dev-server.art.ts';

const PRINT_MS = 260;

export default function DevServer() @{
	let desk = state(START as Desk);
	let said = state('');
	let typed = state('');
	let at = state(0);
	const pick = computed(() => washFor(desk.count));
	const lines = computed(() => {
		const rows = screen(desk, typed, at);
		// An empty tspan takes no x, so a zero-width space holds the caret at the text column.
		return art.terminal.rows.map((slot) => ({ ...slot, ...rows[slot.key]!, text: rows[slot.key]!.text || (rows[slot.key]!.caret ? '\u200b' : '') }));
	});

	<figure
		class="anatomy"
		onKeyDown={(event) => {
			if (event.key !== 'Escape') return;
			const from = event.target as Element;
			halt(from);
			const input = fieldIn(from);
			if (input) input.value = '';
			typed = '';
			at = 0;
			desk = START;
			said = 'Back at the prompt in ' + TARGET + '.';
		}}
	>
		<div class="desk">
			<svg class="scene" data-phase={desk.phase} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="pencil" d={art.terminal.pencil} />
				<path class="pencil" d={art.browser.pencil} />

				<path class="shadow-wash light" d={art.terminal.deskWash} />
				<path class="hatch deep" d={art.terminal.desk} />
				<path class="shadow-wash" d={art.terminal.curl.shadow} />
				<path class="hatch deep" d={art.terminal.curl.hatch} />
				<path class="sheet-paper" d={art.terminal.paper} />
				<path class="sheet-hatch light" d={art.terminal.bar.tone} />
				<path class="sheet-ink" d={art.terminal.bar.ink} />
				@for (const slot of lines; key slot.key) {
					<text class="term" data-kind={slot.kind} transform={slot.matrix}>
						<tspan class="mark">{slot.mark}</tspan>
						<tspan class="line" x="26">{slot.text}</tspan>
						<tspan class="caret">{slot.caret}</tspan>
						<tspan class="line">{slot.after}</tspan>
						<tspan class="ghost">{slot.ghost}</tspan>
					</text>
				}
				<path class="sheet-ink" d={art.terminal.curl.ink} />
				<path class="sheet-ink" d={art.terminal.ink} />

				<path class="shadow-wash light" d={art.browser.deskWash} />
				<path class="hatch deep" d={art.browser.desk} />
				<path class="shadow-wash" d={art.browser.curl.shadow} />
				<path class="hatch deep" d={art.browser.curl.hatch} />
				<path class="sheet-paper" d={art.browser.paper} />
				<path class="sheet-hatch light" d={art.browser.bar.tone} />
				<path class="sheet-paper" d={art.browser.pill.paper} />
				<path class="sheet-ink" d={art.browser.pill.ink} />
				<path class="sheet-ink" d={art.browser.nav} />
				<text class="url" transform={art.browser.pill.matrix}>{HOST}</text>
				<path class="sheet-ink" d={art.browser.bar.ink} />
				<g class="served">
					<text class="page-head" transform={art.browser.head}>{HEADING}</text>
					<path class="sheet-hatch" d={art.browser.button.side} />
					<path class="sheet-paper" d={art.browser.button.paper} />
					<path class="wash pink" d={art.browser.button.wash} />
					<path class="wash pink pool" d={art.browser.button.pool} />
					<g class="digit-wash" data-on={pick === 0 ? 'yes' : 'no'}>
						<path class="wash yellow over" d={art.browser.washes[0]!.wash} />
						<path class="wash yellow pool" d={art.browser.washes[0]!.pool} />
					</g>
					<g class="digit-wash" data-on={pick === 1 ? 'yes' : 'no'}>
						<path class="wash yellow over" d={art.browser.washes[1]!.wash} />
						<path class="wash yellow pool" d={art.browser.washes[1]!.pool} />
					</g>
					<g class="digit-wash" data-on={pick === 2 ? 'yes' : 'no'}>
						<path class="wash yellow over" d={art.browser.washes[2]!.wash} />
						<path class="wash yellow pool" d={art.browser.washes[2]!.pool} />
					</g>
					<path class="sheet-ink" d={art.browser.button.ink} />
					<text class="page-button label" transform={art.browser.button.label}>{LABEL}</text>
					<text class="page-button count" transform={art.browser.button.count}>{desk.count}</text>
				</g>
				<path class="sheet-ink" d={art.browser.curl.ink} />
				<path class="sheet-ink" d={art.browser.ink} />

				<g class="note">
					<path class="halo" d={art.note.arrow} />
					<path class="ink" d={art.note.arrow} />
					<text class="hand" x={art.note.at.x} y={art.note.at.y}>THIS PAGE IS</text>
					<text class="hand-file" x={art.note.file.x} y={art.note.file.y}>{PAGE_FILE}</text>
				</g>
			</svg>
			<div class="term-hit" style={art.terminal.box} aria-hidden="true" onClick={(event) => fieldIn(event.target as Element)?.focus()}></div>
			<input
				class="line-in"
				type="text"
				aria-label={'Terminal in ' + TARGET + '. Type ' + COMMAND + ' and press Enter.'}
				readonly={desk.phase !== 'off'}
				maxlength={MAX_TYPED}
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				enterkeyhint="go"
				onInput={(event) => {
					const input = event.target as HTMLInputElement;
					typed = input.value;
					at = input.selectionStart ?? input.value.length;
				}}
				onKeyUp={(event) => {
					const input = event.target as HTMLInputElement;
					at = input.selectionStart ?? input.value.length;
				}}
				onKeyDown={(event) => {
					const input = event.target as HTMLInputElement;
					if (event.key === 'ArrowRight' && desk.phase === 'off' && input.selectionStart === input.value.length && ghostFor(input.value) !== '') {
						input.value = input.value + ghostFor(input.value);
						typed = input.value;
						at = input.value.length;
						return;
					}
					if (event.key !== 'Enter') return;
					const after = enter(desk, input.value);
					if (after === desk) return;
					input.value = '';
					typed = '';
					at = 0;
					if (after.phase === 'off') {
						desk = after;
						said = describe(after);
						return;
					}
					if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
						let done = after;
						while (done.phase === 'starting') done = print(done);
						desk = done;
						said = describe(done);
						return;
					}
					desk = after;
					said = COMMAND;
					every(input, PRINT_MS, () => {
						desk = print(desk);
						said = describe(desk);
						return desk.phase === 'starting';
					});
				}}
			/>
			<button
				type="button"
				class="hit"
				style={art.browser.button.box}
				aria-label={LABEL + ' ' + desk.count}
				disabled={desk.phase !== 'on'}
				onClick={() => {
					desk = press(desk);
					said = describe(desk, true);
				}}
			></button>
		</div>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A sheet of paper drawn as a terminal shows cd {TARGET} already run, and a prompt waiting for
			you to type {COMMAND}. Below it lies a browser window at {HOST}, still blank. Type {COMMAND} and press Enter, or press Enter on
			the empty prompt to take the suggestion: the dev server prints its Local address, and the browser shows the starter page from
			{PAGE_FILE}, a {HEADING} heading and a {LABEL} button. Press that button to count, as the real page does. Escape starts over.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				container: anatomy / inline-size;
			}

			.desk {
				position: relative;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
				}
			}

			.term-hit {
				position: absolute;
				cursor: text;
			}

			.line-in {
				position: absolute;
				left: 8%;
				top: 12%;
				width: 1px;
				height: 1px;
				padding: 0;
				border: 0;
				font-size: 16px;
				opacity: 0;
				pointer-events: none;
			}

			.caret {
				visibility: hidden;
				font-weight: 700;
				animation: blink 1.06s steps(1) infinite;
			}

			.desk:has(.line-in:focus) .caret {
				visibility: visible;
			}

			@keyframes blink {
				50% {
					opacity: 0;
				}
			}

			.ghost {
				opacity: 0.32;
			}

			.hit {
				position: absolute;
				padding: 0;
				border: 0;
				background: transparent;
				cursor: pointer;
				border-radius: 8px;
			}

			.hit:disabled {
				cursor: default;
			}

			.hit:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
			}

			.sheet-paper {
				fill: var(--sheet);
			}

			.sheet-ink {
				fill: var(--sheet-ink);
			}

			.sheet-hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.6;
				stroke-linecap: round;
				opacity: 0.8;
			}

			.ink {
				fill: var(--ink);
			}

			.halo {
				fill: none;
				stroke: var(--paper);
				stroke-width: 2.6;
				stroke-linejoin: round;
			}

			.light {
				opacity: 0.55;
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
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
			}

			.pink {
				fill: var(--pink);
				stroke: var(--pink);
				opacity: 0.6;
			}

			.over {
				mix-blend-mode: normal;
				opacity: 0.9;
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.pink.pool {
				fill: var(--pink);
				opacity: 0.45;
			}

			.term,
			.url {
				font-family: var(--font-mono);
				fill: var(--sheet-ink);
				white-space: pre;
				font-variant-ligatures: none;
			}

			.term {
				font-size: 12px;
			}

			.term[data-kind='cmd'] .line,
			.term[data-kind='prompt'] :is(.line, .ghost),
			.term[data-kind='local'] .line {
				font-weight: 700;
			}

			.term[data-kind='note'] .line {
				opacity: 0.6;
			}

			.mark {
				opacity: 0.7;
			}

			.url {
				font-size: 11px;
				font-weight: 500;
			}

			.page-head,
			.page-button {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--sheet-ink);
				font-weight: 700;
			}

			.page-head {
				font-size: 28px;
			}

			.page-button {
				font-size: 17px;
			}

			.label {
				text-anchor: end;
			}

			.hand,
			.hand-file {
				text-anchor: end;
				fill: var(--ink);
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
			}

			.hand-file {
				font-family: var(--font-mono);
				font-size: 13px;
				font-weight: 700;
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.5;

				html.dark & {
					opacity: 0.32;
				}
			}

			.digit-wash[data-on='no'],
			.scene[data-phase='off'] .served,
			.scene[data-phase='off'] .note,
			.scene[data-phase='starting'] .served,
			.scene[data-phase='starting'] .note {
				opacity: 0;
			}

			.scene[data-phase='on'] .served {
				animation: ink-in 700ms ease-out both;
			}

			.scene[data-phase='on'] .note {
				animation: ink-in 600ms 600ms ease-out both;
			}

			@keyframes ink-in {
				from {
					opacity: 0;
				}
			}

			@container anatomy (max-width: 520px) {
				.term {
					font-size: 17px;
				}

				.url {
					font-size: 15px;
				}

				.page-head {
					font-size: 32px;
				}

				.page-button {
					font-size: 19px;
				}

				.hand,
				.hand-file {
					font-size: 15px;
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
