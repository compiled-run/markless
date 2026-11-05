// A compiler explorer in ink: the chat box's source on a sheet, its real compiled pieces on slips, each joined to the span it came from. Edit the source and the browser recompiles it.
import { computed, state } from '@markless/core';
import { connector, LINE_SLOTS, PIECE_SLOTS, slipRows, START_SOURCE } from './model.ts';
import type { Explored } from './pieces.ts';
import { START } from './start.art.ts';
import { art } from './explorer.art.ts';

const NONE = { a: '', b: '', c: '', kind: 'none', on: 'no' };
const EMPTY = { shown: 'no', id: '', what: '', kind: 'none', style: '', on: 'off', d: '' };

export default function ExplorerAnatomy() @{
	let source = state(START_SOURCE);
	let result = state<Explored>(START);
	let editing = state(false);
	let busy = state(false);
	let hover = state('');
	let run = state('');
	let said = state('The chat box compiles to three pieces: state:draft, symbol:1 for the text update, and symbol:0 for the input handler.');
	let ticket = state(0);
	const lines = computed(() => source.split('\n'));
	const shown = computed(() => result.pieces.slice(0, PIECE_SLOTS));
	const morePieces = computed(() => Math.max(0, result.pieces.length - PIECE_SLOTS));
	const moreLines = computed(() => Math.max(0, lines.length - LINE_SLOTS));
	const active = computed(() => {
		if (hover.startsWith('s')) return Number(hover.slice(1));
		if (hover.startsWith('l')) return shown.findIndex((p) => p.line === Number(hover.slice(1)));
		return -1;
	});
	const pairOn = (index: number) => (active === -1 ? 'rest' : active === index ? 'yes' : 'no');
	const rows = computed(() =>
		Array.from({ length: LINE_SLOTS }, (_, i) => {
			const text = lines[i] ?? '';
			const index = shown.findIndex((p) => p.line === i);
			const piece = shown[index];
			if (!piece) return { ...NONE, a: text };
			return { a: text.slice(0, piece.from), b: text.slice(piece.from, piece.to), c: text.slice(piece.to), kind: piece.kind, on: pairOn(index) };
		}),
	);
	const slips = computed(() =>
		Array.from({ length: PIECE_SLOTS }, (_, i) => {
			const piece = shown[i];
			if (!piece) return EMPTY;
			const at = slipRows(i, shown.length);
			return {
				shown: 'yes',
				id: piece.id,
				what: piece.what,
				kind: piece.kind,
				style: 'top:calc(var(--lh) * ' + at.top.toFixed(2) + ');height:calc(var(--lh) * ' + at.height.toFixed(2) + ')',
				on: pairOn(i),
				d: piece.line >= 0 && piece.line < LINE_SLOTS ? connector(piece.line, i, shown.length) : '',
			};
		}),
	);
	const caption = computed(() => {
		const piece = shown[active];
		if (piece) return piece.id + ': ' + piece.what + ', from line ' + (piece.line + 1);
		if (hover.startsWith('l')) return 'line ' + (Number(hover.slice(1)) + 1) + ' became no piece of its own';
		if (hover === 'edit') return editing ? 'stop editing' : 'edit the source; the browser recompiles it as you type';
		return editing ? "Try it: change state('Hi') to a plain 'Hi'." : 'Hover a coloured line or a slip, or press Edit.';
	});
	const recompile = async (next: string) => {
		source = next;
		const mine = ++ticket;
		busy = true;
		const { explore } = await import('./explore.ts');
		const answer = await explore(next);
		if (mine !== ticket) return;
		result = answer;
		busy = false;
		run = run === 'a' ? 'b' : 'a';
		const count = answer.pieces.length + (answer.pieces.length === 1 ? ' piece' : ' pieces');
		said = answer.errors.length
			? 'Compiled to ' + count + ', with an error: ' + answer.errors.join(', ') + '.'
			: 'Compiled to ' + count + ': ' + answer.pieces.map((p) => p.id).join(', ') + '.';
	};
	const reset = () => {
		ticket++;
		busy = false;
		editing = false;
		source = START_SOURCE;
		result = START;
		hover = '';
		said = 'Back to the starting source and its three pieces.';
	};
	const keyOf = (target: EventTarget | null) => (target as Element | null)?.closest?.('[data-key]')?.getAttribute('data-key') ?? '';

	<figure
		class="explorer"
		onKeyDown={(event) => {
			if (event.key === 'Escape') reset();
			if (editing || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
			event.preventDefault();
			const n = shown.length;
			const at = hover.startsWith('s') ? Number(hover.slice(1)) : -1;
			hover = 's' + (event.key === 'ArrowDown' ? (at + 1) % n : (at - 1 + n) % n);
		}}
		onPointerover={(event) => {
			const key = keyOf(event.target);
			if (key) hover = key;
		}}
		onPointerdown={(event) => {
			const key = keyOf(event.target);
			if (key) hover = key;
		}}
		onPointerleave={(event) => {
			if (event.pointerType !== 'touch') hover = '';
		}}
	>
		<div class="bench" data-busy={busy ? 'yes' : 'no'}>
			<div class="head head-source">
				<span class="file">chat.tsrx</span>
				<button
					type="button"
					class="edit"
					data-key="edit"
					aria-pressed={editing ? 'true' : 'false'}
					onClick={() => {
						editing = !editing;
						said = editing ? 'Editing. The compiler loads in the browser and recompiles as you type.' : 'Done editing.';
					}}
				>
					{editing ? 'Done' : 'Edit'}
				</button>
			</div>
			<svg class="arrow" data-run={run} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				@for (const layer of art.layers; key layer.key) {
					<path class={layer.cls} d={layer.d} />
				}
			</svg>
			<div class="head head-out">
				<span class="count">{busy ? 'compiling…' : result.pieces.length + (result.pieces.length === 1 ? ' piece' : ' pieces')}</span>
			</div>
			<div class="ink-card sheet" data-editing={editing ? 'yes' : 'no'} tabindex="0" aria-label="chat.tsrx and its compiled pieces. Up and down arrows step through the pieces; Escape starts again.">
				<ol class="lines" aria-hidden={editing ? 'true' : 'false'}>
					<li data-key="l0" data-on={rows[0].on}>
						{rows[0].a}<mark class="wash" data-kind={rows[0].kind}>{rows[0].b}</mark>{rows[0].c}
					</li>
					<li data-key="l1" data-on={rows[1].on}>
						{rows[1].a}<mark class="wash" data-kind={rows[1].kind}>{rows[1].b}</mark>{rows[1].c}
					</li>
					<li data-key="l2" data-on={rows[2].on}>
						{rows[2].a}<mark class="wash" data-kind={rows[2].kind}>{rows[2].b}</mark>{rows[2].c}
					</li>
					<li data-key="l3" data-on={rows[3].on}>
						{rows[3].a}<mark class="wash" data-kind={rows[3].kind}>{rows[3].b}</mark>{rows[3].c}
					</li>
					<li data-key="l4" data-on={rows[4].on}>
						{rows[4].a}<mark class="wash" data-kind={rows[4].kind}>{rows[4].b}</mark>{rows[4].c}
					</li>
					<li data-key="l5" data-on={rows[5].on}>
						{rows[5].a}<mark class="wash" data-kind={rows[5].kind}>{rows[5].b}</mark>{rows[5].c}
					</li>
					<li data-key="l6" data-on={rows[6].on}>
						{rows[6].a}<mark class="wash" data-kind={rows[6].kind}>{rows[6].b}</mark>{rows[6].c}
					</li>
					<li data-key="l7" data-on={rows[7].on}>
						{rows[7].a}<mark class="wash" data-kind={rows[7].kind}>{rows[7].b}</mark>{rows[7].c}
					</li>
					<li data-key="l8" data-on={rows[8].on}>
						{rows[8].a}<mark class="wash" data-kind={rows[8].kind}>{rows[8].b}</mark>{rows[8].c}
					</li>
					<li data-key="l9" data-on={rows[9].on}>
						{rows[9].a}<mark class="wash" data-kind={rows[9].kind}>{rows[9].b}</mark>{rows[9].c}
					</li>
					<li data-key="l10" data-on={rows[10].on}>
						{rows[10].a}<mark class="wash" data-kind={rows[10].kind}>{rows[10].b}</mark>{rows[10].c}
					</li>
					<li data-key="l11" data-on={rows[11].on}>
						{rows[11].a}<mark class="wash" data-kind={rows[11].kind}>{rows[11].b}</mark>{rows[11].c}
					</li>
				</ol>
				@if (editing) {
					<textarea
						class="code-edit"
						spellcheck="false"
						rows={12}
						aria-label="chat.tsrx source"
						value={source}
						onInput={(event) => recompile(event.currentTarget.value)}
					></textarea>
				}
				<p class="more" data-shown={moreLines ? 'yes' : 'no'}>… {moreLines} more line{moreLines === 1 ? '' : 's'}</p>
			</div>
			<svg class="gutter" viewBox="0 0 40 120" preserveAspectRatio="none" aria-hidden="true">
				<path class="link" data-kind={slips[0].kind} data-on={slips[0].on} d={slips[0].d} vector-effect="non-scaling-stroke" />
				<path class="link" data-kind={slips[1].kind} data-on={slips[1].on} d={slips[1].d} vector-effect="non-scaling-stroke" />
				<path class="link" data-kind={slips[2].kind} data-on={slips[2].on} d={slips[2].d} vector-effect="non-scaling-stroke" />
				<path class="link" data-kind={slips[3].kind} data-on={slips[3].on} d={slips[3].d} vector-effect="non-scaling-stroke" />
			</svg>
			<div class="slips">
				<div class="ink-card slip" data-key="s0" data-kind={slips[0].kind} data-on={slips[0].on} data-shown={slips[0].shown} style={slips[0].style}>
					<code>{slips[0].id}</code>
					<span>{slips[0].what}</span>
				</div>
				<div class="ink-card slip" data-key="s1" data-kind={slips[1].kind} data-on={slips[1].on} data-shown={slips[1].shown} style={slips[1].style}>
					<code>{slips[1].id}</code>
					<span>{slips[1].what}</span>
				</div>
				<div class="ink-card slip" data-key="s2" data-kind={slips[2].kind} data-on={slips[2].on} data-shown={slips[2].shown} style={slips[2].style}>
					<code>{slips[2].id}</code>
					<span>{slips[2].what}</span>
				</div>
				<div class="ink-card slip" data-key="s3" data-kind={slips[3].kind} data-on={slips[3].on} data-shown={slips[3].shown} style={slips[3].style}>
					<code>{slips[3].id}</code>
					<span>{slips[3].what}</span>
				</div>
				<p class="more" data-shown={morePieces ? 'yes' : 'no'}>… and {morePieces} more</p>
			</div>
		</div>
		<p class="errors" data-shown={result.errors.length ? 'yes' : 'no'}>Doesn’t compile yet: {result.errors.join(', ')}</p>
		<p class="hover-caption" aria-hidden="true">{caption}</p>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.explorer {
				margin: var(--space-m) 0;
				container: explorer / inline-size;
				--state: var(--yellow);
				--update: var(--green-soft);
				--handler: var(--pink);
			}

			.bench {
				--lh: calc(var(--step--1) * 1.55);
				--pad: 0.7rem;
				display: grid;
				grid-template-columns: max-content 3rem minmax(8.5rem, 1fr);
				grid-template-rows: auto auto;
				column-gap: 0;
				row-gap: 0.45rem;
				align-items: center;
			}

			.head {
				display: flex;
				align-items: center;
				gap: 0.6rem;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 0.95rem;
				font-weight: 700;
			}

			.head-source {
				justify-content: space-between;
				padding-inline: 0.2rem 0.9rem;
			}

			.head-out {
				justify-content: space-between;
				padding-inline-start: 0.4rem;
			}

			.file {
				font-family: var(--font-mono);
				font-size: var(--step--1);
			}

			.count {
				white-space: nowrap;
			}

			.edit {
				padding: 0.15rem 0.9rem;
				border: 1.5px solid var(--ink);
				border-radius: 0.7rem;
				background: color-mix(in oklch, var(--pink) 55%, var(--paper));
				color: var(--ink);
				font: inherit;
				box-shadow: 2px 2px 0 var(--ink);
				cursor: pointer;
			}

			.edit:active {
				translate: 1px 1px;
				box-shadow: 1px 1px 0 var(--ink);
			}

			.edit[aria-pressed='true'] {
				background: var(--yellow);
				color: oklch(24% 0.01 70);
			}

			.arrow {
				width: 100%;
				height: 1.4rem;
				overflow: visible;
			}

			.ink {
				fill: var(--ink);
			}

			.arrow[data-run='a'] {
				animation: compile-a 700ms ease;
			}

			.arrow[data-run='b'] {
				animation: compile-b 700ms ease;
			}

			@keyframes compile-a {
				40% {
					translate: 0.45rem 0;
					scale: 1.15;
				}
			}

			@keyframes compile-b {
				40% {
					translate: 0.45rem 0;
					scale: 1.15;
				}
			}

			.sheet {
				position: relative;
				margin: 0;
				padding: var(--pad) calc(var(--pad) + 11px) var(--pad) var(--pad);
				align-self: start;
			}

			.sheet[data-editing='yes']::before {
				background: color-mix(in oklch, var(--yellow) 22%, var(--raised));
				box-shadow: 4px 4px 0 var(--yellow);
			}

			.lines,
			.code-edit {
				margin: 0;
				padding: 0;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				line-height: 1.55;
				tab-size: 2;
				white-space: pre;
			}

			.lines {
				list-style: none;
			}

			.lines li {
				height: var(--lh);
				font-family: var(--font-mono);
				line-height: inherit;
			}

			.code-edit {
				position: absolute;
				inset: var(--pad) calc(var(--pad) + 11px) var(--pad) var(--pad);
				height: calc(var(--lh) * 12);
				border: 0;
				outline: none;
				background: transparent;
				color: transparent;
				caret-color: var(--ink);
				resize: none;
				overflow: hidden;
			}

			.wash {
				padding: 0.05em 0;
				border-radius: 0.25em;
				color: inherit;
				font-family: var(--font-mono);
				transition: background 150ms ease;
			}

			.wash[data-kind='none'] {
				background: none;
			}

			.wash[data-kind='state'] {
				--c: var(--state);
			}

			.wash[data-kind='update'] {
				--c: var(--update);
			}

			.wash[data-kind='handler'] {
				--c: var(--handler);
			}

			.wash:not([data-kind='none']) {
				background: color-mix(in oklch, var(--c) 60%, transparent);
			}

			li[data-on='yes'] .wash:not([data-kind='none']) {
				background: var(--c);
				box-shadow: 0 0 0 1.5px var(--ink);
			}

			li[data-on='no'] .wash:not([data-kind='none']) {
				background: color-mix(in oklch, var(--c) 25%, transparent);
			}

			.gutter {
				align-self: start;
				width: 100%;
				height: calc(var(--lh) * 12);
				margin-top: var(--pad);
				overflow: visible;
			}

			.link {
				fill: none;
				stroke: var(--ink);
				stroke-width: 1.3;
				stroke-linecap: round;
				opacity: 0.75;
				transition:
					opacity 150ms ease,
					stroke-width 150ms ease;
			}

			.link[data-kind='none'] {
				display: none;
			}

			.link[data-on='yes'] {
				stroke-width: 2.4;
				opacity: 1;
			}

			.link[data-on='no'] {
				opacity: 0.2;
			}

			.slips {
				position: relative;
				align-self: start;
				height: calc(var(--lh) * 12);
				margin-top: var(--pad);
			}

			.slip {
				position: absolute;
				left: 0;
				right: 0;
				margin: 0;
				padding: 0.2rem 0.6rem 0.2rem 0.6rem;
				display: flex;
				flex-direction: column;
				justify-content: center;
				gap: 0.1rem;
				rotate: -0.6deg;
				transition:
					opacity 250ms ease,
					translate 150ms ease;
			}

			.slip:nth-child(2n) {
				rotate: 0.8deg;
			}

			.slip::before {
				background: color-mix(in oklch, var(--c, var(--raised)) 45%, var(--raised));
			}

			.slip[data-kind='state'] {
				--c: var(--state);
			}

			.slip[data-kind='update'] {
				--c: var(--update);
			}

			.slip[data-kind='handler'] {
				--c: var(--handler);
			}

			.slip[data-shown='no'] {
				display: none;
			}

			.slip[data-on='yes'] {
				translate: -0.3rem 0;
			}

			.slip[data-on='yes']::before {
				background: var(--c);
			}

			.slip[data-on='no'] {
				opacity: 0.55;
			}

			.slip code {
				background: none;
				padding: 0;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				font-weight: 700;
				white-space: nowrap;
			}

			.slip span {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 0.85rem;
				line-height: 1.2;
				white-space: nowrap;
			}

			.bench[data-busy='yes'] .slips {
				opacity: 0.6;
			}

			.more {
				position: absolute;
				bottom: -1.6rem;
				left: 0.4rem;
				margin: 0;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 0.85rem;
			}

			.more[data-shown='no'],
			.errors[data-shown='no'] {
				display: none;
			}

			.errors {
				margin: 0.8rem 0 0;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 0.9rem;
				color: color-mix(in srgb, var(--pink) 70%, #c0403c);
			}

			@container explorer (max-width: 560px) {
				.bench {
					grid-template-columns: minmax(0, 1fr);
				}

				.arrow,
				.gutter {
					display: none;
				}

				.sheet {
					overflow-x: auto;
				}

				.head-out {
					order: 1;
					margin-top: 0.6rem;
				}

				.slips {
					order: 2;
					height: auto;
					margin-top: 0;
					display: grid;
					grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
					gap: 0.7rem;
				}

				.slip {
					position: relative;
					height: auto !important;
					top: auto !important;
					padding-block: 0.4rem;
				}

				.slip[data-shown='no'] {
					display: none;
				}

				.more {
					position: static;
				}
			}

			.hover-caption {
				margin: 0.5rem 0 0;
				min-height: 1.4em;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 0.95rem;
				text-align: center;
				color: var(--ink);
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
