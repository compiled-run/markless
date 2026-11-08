// A VS Code-style window with profile.tsrx: install the TSRX extension and the code inks into colour; then hover name and its type shows under the window, and click {name} to misspell it and watch the red line arrive.
import { computed, state } from '@markless/core';
import Part from './part.tsrx';
import { art } from './editor.art.ts';
import { HINTS, MATCHES } from './editor.ts';

export default function EditorFigure() @{
	let installed = state(false);
	let typo = state(false);
	let pin = state(0);
	let over = state(0);
	let query = state('');
	let seen = state(false);
	let said = state('');
	const found = computed(() => query.trim() !== '' && MATCHES.includes(query.trim().toLowerCase()));
	const listed = computed(() => found || installed);
	const stage = computed(() => (!listed ? 'search' : !installed ? 'install' : !seen ? 'hover' : !typo ? 'typo' : 'done'));
	const dials = computed(() => '--inst:' + (installed ? 1 : 0) + ';--typo:' + (typo ? 1 : 0) + ';--list:' + (listed ? 1 : 0) + ';--none:' + (!listed && query.trim() !== '' ? 1 : 0));
	const searchAt = 'left:' + ((art.hits.search.x / art.width) * 100) + '%;top:' + ((art.hits.search.y / art.height) * 100) + '%;width:' + ((art.hits.search.w / art.width) * 100) + '%;height:' + ((art.hits.search.h / art.height) * 100) + '%';
	const shown = computed(() => {
		const at = over || pin;
		if (!installed || !at) return '';
		return at === 2 && typo ? art.messages.typo : art.messages.name;
	});
	const lineClass = computed(() => (shown ? 'hover-line on' : stage === 'done' ? 'hover-line' : 'hover-line hint'));
	const lineText = computed(() => shown || (stage === 'done' ? '' : HINTS[stage as keyof typeof HINTS]));
	const which = (event: Event) => {
		const what = (event.target as Element).closest('[data-hit]')?.getAttribute('data-hit');
		return what === 'decl' ? 1 : what === 'use' ? 2 : 0;
	};

	const install = () => {
		if (!listed) return;
		installed = !installed;
		pin = 0;
		said = installed ? 'TSRX Syntax for VS Code is installed. profile.tsrx is in colour, and hovers and red lines work.' : 'Uninstalled. profile.tsrx is plain text again: no colours, no hovers, no red lines.';
	};
	const misspell = () => {
		typo = !typo;
		pin = 0;
		if (!installed) said = typo ? 'Line 7 now reads {nmae}. Nothing marks it: the extension is not installed.' : 'Line 7 reads {name} again.';
		else said = typo ? "Line 7 now reads {nmae}. A red line: Cannot find name 'nmae'." : 'Line 7 reads {name} again, and the red line is gone.';
	};
	const hover = (n: number) => {
		pin = pin === n ? 0 : n;
		if (installed && n === 1) seen = true;
		if (pin && !installed) said = 'No hover: the extension is not installed.';
		else if (pin === 1 || (pin === 2 && !typo)) said = 'let name: string';
		else if (pin === 2) said = "Cannot find name 'nmae'. ts(2304)";
	};

	<figure
		class="anatomy toy"
		tabindex={0}
		aria-label="A code editor with profile.tsrx and the Extensions sidebar. Type in the search box to find the TSRX extension. Enter searches tsrx, then installs or uninstalls it; H shows the hover on name, T misspells name on line 7, Escape resets."
		onKeyDown={(event) => {
			const typing = (event.target as Element).tagName === 'INPUT';
			if (typing && event.key !== 'Escape') return;
			const key = event.key.toLowerCase();
			if (event.key === 'Escape') {
				installed = false;
				typo = false;
				pin = 0;
				query = '';
				seen = false;
				said = 'Back to the start: the extension is not installed.';
				return;
			}
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				if (!listed) {
					query = 'tsrx';
					said = 'Searched tsrx: TSRX Syntax for VS Code is listed.';
				} else install();
				return;
			}
			if (key === 'h') hover(typo ? 2 : 1);
			if (key === 't') misspell();
		}}
	>
		<div class="frame">
		<svg
			class="scene"
			viewBox={art.view}
			data-stage={stage}
			style={dials}
			aria-hidden="true"
			onPointerMove={(event) => {
				over = which(event);
				if (over === 1 && installed) seen = true;
			}}
			onPointerLeave={() => {
				over = 0;
			}}
			onPointerDown={(event) => {
				if (event.button !== 0) return;
				const what = (event.target as Element).closest('[data-hit]')?.getAttribute('data-hit');
				if (what === 'install') install();
				else if (what === 'use') misspell();
				else if (what === 'decl') hover(1);
			}}
		>
			<Part art={art.base} />
			<g class="plain">
				<Part art={art.plain} />
				<g class="right">
					<Part art={art.heading.plainRight} />
				</g>
				<g class="typo">
					<Part art={art.heading.plainTypo} />
				</g>
			</g>
			<g class="colour">
				<Part art={art.colour} />
				<g class="right">
					<Part art={art.heading.colourRight} />
				</g>
				<g class="typo">
					<Part art={art.heading.colourTypo} />
				</g>
			</g>
			<g class="mark">
				<Part art={art.squiggle} />
			</g>
			<g class="listing">
				<Part art={art.listing} />
			</g>
			<g class="empty">
				<Part art={art.empty} />
			</g>
			<g class="ring r-search">
				<Part art={art.rings.search} />
			</g>
			<g class="ring r-install">
				<Part art={art.rings.install} />
			</g>
			<g class="ring r-hover">
				<Part art={art.rings.hover} />
			</g>
			<g class="ring r-typo">
				<Part art={art.rings.typo} />
			</g>
			<g class="btn-install">
				<Part art={art.install} />
			</g>
			<g class="btn-uninstall">
				<Part art={art.uninstall} />
			</g>
			<g class="tokens">
				<rect class="hit entry" x={art.hits.entry.x} y={art.hits.entry.y} width={art.hits.entry.w} height={art.hits.entry.h} rx="4" />
				<rect class="hit press" data-hit="install" x={art.hits.install.x} y={art.hits.install.y} width={art.hits.install.w} height={art.hits.install.h} rx="5" />
				<rect class="hit decl" data-hit="decl" x={art.hits.decl.x} y={art.hits.decl.y} width={art.hits.decl.w} height={art.hits.decl.h} rx="3" />
				<rect class="hit use" data-hit="use" x={art.hits.use.x} y={art.hits.use.y} width={art.hits.use.w} height={art.hits.use.h} rx="3" />
			</g>
		</svg>
		<input
			class="search"
			style={searchAt}
			type="search"
			placeholder="Search extensions"
			aria-label="Search extensions"
			value={query}
			onInput={(event) => {
				query = (event.target as HTMLInputElement).value;
				said = query.trim() === '' ? '' : found ? 'TSRX Syntax for VS Code is listed.' : 'No extensions found.';
			}}
		/>
		</div>
		<p class={lineClass} aria-live="off">{lineText}</p>
		<figcaption class="sr">
			A pen-and-ink drawing of a code editor. The Extensions sidebar lists TSRX Syntax for VS Code by TSRX with an Install button, and profile.tsrx is open: let name = state('Ada'), and a section with an h2 that shows name. Before the install the code is plain grey. After it, the code is in colour, hovering name shows let name: string, and misspelling name as nmae draws a red line with the message Cannot find name 'nmae'.
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

			.plain,
			.colour,
			.right,
			.typo,
			.mark,
			.btn-install,
			.btn-uninstall {
				transition: opacity 320ms ease;
			}

			.plain {
				opacity: calc(1 - var(--inst));
			}

			.colour {
				opacity: var(--inst);
			}

			.right {
				opacity: calc(1 - var(--typo));
			}

			.typo {
				opacity: var(--typo);
			}

			.mark {
				opacity: calc(var(--inst) * var(--typo));
			}

			.btn-install {
				opacity: calc(var(--list) * (1 - var(--inst)));
			}

			.listing {
				opacity: var(--list);
				transition: opacity 200ms ease;
			}

			.empty {
				opacity: var(--none);
			}

			.scene[data-stage='search'] .press {
				pointer-events: none;
			}

			.ring {
				opacity: 0;
				pointer-events: none;
			}

			.scene[data-stage='search'] .r-search,
			.scene[data-stage='install'] .r-install,
			.scene[data-stage='hover'] .r-hover,
			.scene[data-stage='typo'] .r-typo {
				opacity: 1;
				animation: nudge 1600ms ease-in-out infinite;
			}

			@keyframes nudge {
				50% {
					opacity: 0.35;
				}
			}

			.frame {
				position: relative;
			}

			.search {
				position: absolute;
				box-sizing: border-box;
				margin: 0;
				padding: 0 0.4em;
				border: 0;
				background: transparent;
				font: 500 clamp(9px, 1.4vw, 0.8rem) / 1 var(--font-mono);
				color: var(--ink);

				html.dark & {
					color: var(--paper);
				}
				outline: none;
				-webkit-appearance: none;
				appearance: none;
			}

			.search::placeholder {
				font-family: 'Joy Elia', system-ui, sans-serif;
				letter-spacing: 0.04em;
				color: color-mix(in oklch, var(--ink) 45%, transparent);

				html.dark & {
					color: color-mix(in oklch, var(--paper) 55%, transparent);
				}
			}

			.search:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 2px;
				border-radius: 4px;
			}

			.btn-uninstall {
				opacity: var(--inst);
			}

			.hit {
				fill: transparent;
				cursor: help;
			}

			.press,
			.use {
				cursor: pointer;
			}

			.entry {
				pointer-events: none;
			}

			.tokens:has(.press:hover) .entry,
			.use:hover {
				fill: color-mix(in oklch, var(--yellow) 30%, transparent);
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

			.hover-line.hint {
				font: 400 1rem/1.4 'Joy Elia', system-ui, sans-serif;
				letter-spacing: 0.05em;
				color: color-mix(in oklch, var(--ink) 70%, transparent);
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
