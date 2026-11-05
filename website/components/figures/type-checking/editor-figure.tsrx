// A small editor with card.tsrx and two type errors: hover a squiggle and TypeScript's message shows under the window; click the wrong value to fix it.
import { computed, state } from '@markless/core';
import Part from '../editor-setup/part.tsrx';
import { art } from './editor.art.ts';

export default function EditorFigure() @{
	let sizeFixed = state(false);
	let titleFixed = state(false);
	let pin = state(0);
	let over = state(0);
	let jump = state(0);
	let beat = state('a');
	let touched = state(false);
	let said = state('');
	const dials = computed(() => '--size:' + (sizeFixed ? 0 : 1) + ';--titel:' + (titleFixed ? 0 : 1) + ';--jump:' + jump + ';--shift:' + (sizeFixed ? art.terminal.shift : 0) + 'px');
	const pulseClass = computed(() => 'pulse-' + beat);

	const shown = computed(() => {
		const at = over || pin;
		if (at === 1 && !sizeFixed) return art.messages.size;
		if (at === 2 && !titleFixed) return art.messages.titel;
		return '';
	});
	const lineClass = computed(() => (shown ? 'hover-line on' : 'hover-line'));
	const which = (event: Event) => {
		const what = (event.target as Element).closest('[data-hit]')?.getAttribute('data-hit');
		return what === 'size' || what === 'value' ? 1 : what === 'titel' ? 2 : 0;
	};

	const fixSize = () => {
		sizeFixed = !sizeFixed;
		pin = 0;
		jump = 0;
		said = sizeFixed ? 'size is the number 48 now. Its squiggle is gone.' : 'size is "large" again: a squiggle, ts(2322).';
	};
	const fixTitle = () => {
		titleFixed = !titleFixed;
		pin = 0;
		jump = 0;
		said = titleFixed ? 'titel is title now. Its squiggle is gone.' : 'titel is back: a squiggle, ts(2552).';
	};
	const goTo = (n: number) => {
		if ((n === 1 && sizeFixed) || (n === 2 && titleFixed)) return;
		jump = n;
		beat = beat === 'a' ? 'b' : 'a';
		said = n === 1 ? 'Jumped to line 8, column 11: ' + art.messages.size : 'Jumped to line 9, column 8: ' + art.messages.titel;
	};
	const show = (n: number) => {
		pin = pin === n ? 0 : n;
		if (pin === 1) said = sizeFixed ? 'No error on size.' : "Type 'string' is not assignable to type 'number'.";
		if (pin === 2) said = titleFixed ? 'No error on title.' : "Cannot find name 'titel'. Did you mean 'title'?";
	};

	<figure
		class="anatomy toy"
		tabindex={0}
		aria-label="An editor with card.tsrx above a terminal that ran npm run check. Down arrow jumps to the next error, keys 1 and 2 show each error's message, Enter fixes the next error, Escape puts both errors back."
		onVisible={() => {
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let off = 0;
			const hint = setTimeout(() => {
				if (touched) return;
				pin = 1;
				off = setTimeout(() => {
					if (!touched) pin = 0;
				}, 2400) as unknown as number;
			}, 1200);
			return () => {
				clearTimeout(hint);
				clearTimeout(off);
			};
		}}
		onKeyDown={(event) => {
			touched = true;
			if (event.key === 'Escape') {
				sizeFixed = false;
				titleFixed = false;
				pin = 0;
				jump = 0;
				said = 'Both errors are back.';
				return;
			}
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				if (!sizeFixed) fixSize();
				else if (!titleFixed) fixTitle();
				return;
			}
			if (event.key === '1') show(1);
			if (event.key === '2') show(2);
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				goTo(jump === 1 && !titleFixed ? 2 : !sizeFixed ? 1 : 2);
			}
		}}
	>
		<svg
			class="scene"
			viewBox={art.view}
			style={dials}
			aria-hidden="true"
			onPointerMove={(event) => {
				over = which(event);
			}}
			onPointerLeave={() => {
				over = 0;
			}}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				touched = true;
				const what = (event.target as Element).closest('[data-hit]')?.getAttribute('data-hit');
				if (what === 'value') fixSize();
				else if (what === 'titel') fixTitle();
				else if (what === 'size') show(1);
				else if (what === 'err0') goTo(1);
				else if (what === 'err1') goTo(2);
			}}
		>
			<Part art={art.base} />
			<g class="jump-band jump-1">
				<Part art={art.bands[0]!.art} />
			</g>
			<g class="jump-band jump-2">
				<Part art={art.bands[1]!.art} />
			</g>
			<g class="size-wrong">
				<g class={'squig-1 ' + pulseClass}>
					<Part art={art.size.wrong} />
				</g>
			</g>
			<g class="size-right">
				<Part art={art.size.right} />
			</g>
			<g class="titel-wrong">
				<g class={'squig-2 ' + pulseClass}>
					<Part art={art.titel.wrong} />
				</g>
			</g>
			<g class="titel-right">
				<Part art={art.titel.right} />
			</g>
			<Part art={art.terminal.base} />
			<g class="err err-1">
				<Part art={art.terminal.errors[0]!.art} />
			</g>
			<g class="err err-2">
				<Part art={art.terminal.errors[1]!.art} />
			</g>
			<rect class="hit err-hit err-hit-1" data-hit="err0" x={art.terminal.errors[0]!.hit.x} y={art.terminal.errors[0]!.hit.y} width={art.terminal.errors[0]!.hit.w} height={art.terminal.errors[0]!.hit.h} rx="4" />
			<rect class="hit err-hit err-hit-2" data-hit="err1" x={art.terminal.errors[1]!.hit.x} y={art.terminal.errors[1]!.hit.y} width={art.terminal.errors[1]!.hit.w} height={art.terminal.errors[1]!.hit.h} rx="4" />
			<g class="tokens">
				<rect class="hit size" data-hit="size" x={art.size.hits.name.x} y={art.size.hits.name.y} width={art.size.hits.name.w} height={art.size.hits.name.h} rx="3" />
				<rect class="hit fixable" data-hit="value" x={art.size.hits.value.x} y={art.size.hits.value.y} width={art.size.hits.value.w} height={art.size.hits.value.h} rx="3" />
				<rect class="hit fixable titel" data-hit="titel" x={art.titel.hits.name.x} y={art.titel.hits.name.y} width={art.titel.hits.name.w} height={art.titel.hits.name.h} rx="3" />
			</g>
		</svg>
		<p class={lineClass} aria-hidden="true">{shown}</p>
		<figcaption class="sr">
			A pen-and-ink drawing of an editor with card.tsrx. Line 8 passes size="large" to Avatar, whose size is a number, and has a red squiggle: Type 'string' is not assignable to type 'number'. Line 9 shows titel, a misspelt title, with a squiggle: Cannot find name 'titel'. Did you mean 'title'? Below it, a terminal ran npm run check and printed both errors with their line and column after two pass lines. Clicking an error line jumps the editor to it. Fixing each value clears its squiggle and drops its line from the terminal.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				border-radius: 12px;

				@media (max-width: 600px) {
					margin-inline: calc(50% - 50vw + 0.4rem);
				}
			}

			.toy:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				user-select: none;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);
				--shade: color-mix(in oklch, var(--ink) 24%, transparent);
				--shade-ink: var(--ink);
				--c-kw: #d73a49;
				--c-fn: #6f42c1;
				--c-str: #032f62;
				--c-tag: #22863a;
				--c-num: #005cc5;
				--c-err: #cb2431;

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
					--shade: rgb(0 0 0 / 0.55);
					--shade-ink: rgb(0 0 0 / 0.85);
				}
			}

			.size-wrong,
			.size-right,
			.titel-wrong,
			.titel-right {
				transition: opacity 180ms ease;
			}

			.size-wrong {
				opacity: var(--size);
			}

			.size-right {
				opacity: calc(1 - var(--size));
			}

			.titel-wrong {
				opacity: var(--titel);
			}

			.titel-right {
				opacity: calc(1 - var(--titel));
			}

			.hit {
				fill: transparent;
				cursor: help;
			}

			.fixable {
				cursor: pointer;
			}

			.fixable:hover {
				fill: color-mix(in oklch, var(--yellow) 35%, transparent);
			}

			.err {
				pointer-events: none;
				transition: opacity 220ms ease, transform 260ms ease;
			}

			.err-1 {
				opacity: var(--size);
			}

			.err-2 {
				opacity: var(--titel);
				transform: translateY(calc(var(--shift) * -1));
			}

			.err-hit-2 {
				transform: translateY(calc(var(--shift) * -1));
			}

			.err-hit {
				cursor: pointer;
				transition: transform 260ms ease;
			}

			.err-hit-1:hover {
				fill: color-mix(in oklch, var(--yellow) calc(var(--size) * 30%), transparent);
			}

			.err-hit-2:hover {
				fill: color-mix(in oklch, var(--yellow) calc(var(--titel) * 30%), transparent);
			}

			.jump-band {
				opacity: 0;
				pointer-events: none;
				transition: opacity 200ms ease;
			}

			.jump-1 {
				opacity: calc(var(--size) * max(0, 1 - max(var(--jump) - 1, 1 - var(--jump))));
			}

			.jump-2 {
				opacity: calc(var(--titel) * max(0, 1 - max(var(--jump) - 2, 2 - var(--jump))));
			}

			.squig-1,
			.squig-2 {
				transform-box: fill-box;
				transform-origin: 50% 80%;
			}

			.scene[style*='--jump:1'] .squig-1.pulse-a,
			.scene[style*='--jump:2'] .squig-2.pulse-a {
				animation: pulse-a 700ms ease-out;
			}

			.scene[style*='--jump:1'] .squig-1.pulse-b,
			.scene[style*='--jump:2'] .squig-2.pulse-b {
				animation: pulse-b 700ms ease-out;
			}

			@keyframes pulse-a {
				30% {
					transform: scale(1.04);
					filter: drop-shadow(0 0 2px var(--c-err));
				}
			}

			@keyframes pulse-b {
				30% {
					transform: scale(1.04);
					filter: drop-shadow(0 0 2px var(--c-err));
				}
			}

			.hover-line {
				box-sizing: border-box;
				min-height: 2.3em;
				margin: 0.2rem auto 0;
				padding: 0.35em 0.8em;
				width: fit-content;
				max-width: 100%;
				border: 1.5px solid transparent;
				border-radius: 6px 9px 7px 8px;
				font: 500 0.88rem/1.4 var(--font-mono);
				color: var(--ink);
				transition: border-color 160ms ease;
			}

			.hover-line.on {
				border-color: var(--ink);
				background: color-mix(in oklch, var(--paper) 50%, white);

				html.dark & {
					background: color-mix(in oklch, var(--ink) 10%, var(--paper));
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
