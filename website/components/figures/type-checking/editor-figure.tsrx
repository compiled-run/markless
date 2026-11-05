// A small editor with card.tsrx and two type errors: hover a squiggle and TypeScript's message shows under the window; click the wrong value to fix it.
import { computed, state } from '@markless/core';
import Part from '../editor-setup/part.tsrx';
import { art } from './editor.art.ts';

export default function EditorFigure() @{
	let sizeFixed = state(false);
	let titleFixed = state(false);
	let pin = state(0);
	let over = state(0);
	let touched = state(false);
	let said = state('');
	const dials = computed(() => '--size:' + (sizeFixed ? 0 : 1) + ';--titel:' + (titleFixed ? 0 : 1));

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
		said = sizeFixed ? 'size is the number 48 now. Its squiggle is gone.' : 'size is "large" again: a squiggle, ts(2322).';
	};
	const fixTitle = () => {
		titleFixed = !titleFixed;
		pin = 0;
		said = titleFixed ? 'titel is title now. Its squiggle is gone.' : 'titel is back: a squiggle, ts(2552).';
	};
	const show = (n: number) => {
		pin = pin === n ? 0 : n;
		if (pin === 1) said = sizeFixed ? 'No error on size.' : "Type 'string' is not assignable to type 'number'.";
		if (pin === 2) said = titleFixed ? 'No error on title.' : "Cannot find name 'titel'. Did you mean 'title'?";
	};

	<figure
		class="anatomy toy"
		tabindex={0}
		aria-label="An editor with card.tsrx and two type errors. Keys 1 and 2 show each error's message, Enter fixes the next error, Escape puts both errors back."
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
			}}
		>
			<Part art={art.base} />
			<g class="size-wrong">
				<Part art={art.size.wrong} />
			</g>
			<g class="size-right">
				<Part art={art.size.right} />
			</g>
			<g class="titel-wrong">
				<Part art={art.titel.wrong} />
			</g>
			<g class="titel-right">
				<Part art={art.titel.right} />
			</g>
			<g class="tokens">
				<rect class="hit size" data-hit="size" x={art.size.hits.name.x} y={art.size.hits.name.y} width={art.size.hits.name.w} height={art.size.hits.name.h} rx="3" />
				<rect class="hit fixable" data-hit="value" x={art.size.hits.value.x} y={art.size.hits.value.y} width={art.size.hits.value.w} height={art.size.hits.value.h} rx="3" />
				<rect class="hit fixable titel" data-hit="titel" x={art.titel.hits.name.x} y={art.titel.hits.name.y} width={art.titel.hits.name.w} height={art.titel.hits.name.h} rx="3" />
			</g>
		</svg>
		<p class={lineClass} aria-hidden="true">{shown}</p>
		<figcaption class="sr">
			A pen-and-ink drawing of an editor with card.tsrx. Line 8 passes size="large" to Avatar, whose size is a number, and has a red squiggle: Type 'string' is not assignable to type 'number'. Line 9 shows titel, a misspelt title, with a squiggle: Cannot find name 'titel'. Did you mean 'title'? Fixing each value clears its squiggle.
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
