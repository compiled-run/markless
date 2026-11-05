// A compiler explorer in ink: the chat box's source on the left, its real compiled pieces on the right. Hover a line to see what it became; edit it and the browser recompiles it.
import { computed, state } from '@markless/core';
import { LINE_SLOTS, PIECE_SLOTS, START_SOURCE } from './model.ts';
import type { Explored } from './pieces.ts';
import { START } from './start.art.ts';
import { art } from './explorer.art.ts';

export default function ExplorerAnatomy() @{
	let source = state(START_SOURCE);
	let result = state<Explored>(START);
	let editing = state(false);
	let busy = state(false);
	let hover = state('');
	let said = state('The chat box compiles to three pieces: state:draft, symbol:0 for the input handler, and symbol:1 for the text update.');
	let ticket = state(0);
	const lines = computed(() => source.split('\n'));
	const hoverLine = computed(() => (hover.startsWith('l') ? Number(hover.slice(1)) : hover.startsWith('p') ? (result.pieces[Number(hover.slice(1))]?.line ?? -1) : -1));
	const caption = computed(() => {
		if (hover.startsWith('p')) {
			const piece = result.pieces[Number(hover.slice(1))];
			return piece ? piece.id + ': ' + piece.what + ', from line ' + (piece.line + 1) : '';
		}
		if (hover.startsWith('l')) {
			const made = result.pieces.filter((p) => p.line === Number(hover.slice(1))).map((p) => p.id);
			return made.length ? 'line ' + (Number(hover.slice(1)) + 1) + ' became ' + made.join(' and ') : 'line ' + (Number(hover.slice(1)) + 1) + ' became no piece of its own';
		}
		if (hover === 'edit') return 'edit the source; the browser recompiles it as you type';
		return editing ? "Try it: change state('Hi') to a plain 'Hi'." : 'Hover a line or a piece, or press Edit.';
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
		said = answer.errors.length
			? 'Compiled with ' + answer.pieces.length + ' pieces and an error: ' + answer.errors.join(', ') + '.'
			: 'Compiled to ' + answer.pieces.length + ' pieces: ' + answer.pieces.map((p) => p.id).join(', ') + '.';
	};
	const reset = () => {
		editing = false;
		source = START_SOURCE;
		result = START;
		said = 'Back to the starting source and its three pieces.';
	};
	const keyOf = (target: EventTarget | null) => (target as Element | null)?.closest?.('[data-key]')?.getAttribute('data-key') ?? '';

	<figure
		class="explorer"
		onKeyDown={(event) => {
			if (event.key === 'Escape') reset();
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
		<div class="board">
			<svg class="frames" viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				@for (const layer of art.layers; key layer.key) {
					<path class={layer.cls} d={layer.d} />
				}
			</svg>
			<div class="pane source-pane">
				<div class="bar">
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
				@if (editing) {
					<textarea
						class="code-edit"
						spellcheck="false"
						aria-label="chat.tsrx source"
						value={source}
						onInput={(event) => recompile(event.currentTarget.value)}
					></textarea>
				} @else {
					<ol class="lines">
						<li data-key="l0" data-on={hoverLine === 0 ? 'yes' : 'no'}>{lines[0] ?? ''}</li>
						<li data-key="l1" data-on={hoverLine === 1 ? 'yes' : 'no'}>{lines[1] ?? ''}</li>
						<li data-key="l2" data-on={hoverLine === 2 ? 'yes' : 'no'}>{lines[2] ?? ''}</li>
						<li data-key="l3" data-on={hoverLine === 3 ? 'yes' : 'no'}>{lines[3] ?? ''}</li>
						<li data-key="l4" data-on={hoverLine === 4 ? 'yes' : 'no'}>{lines[4] ?? ''}</li>
						<li data-key="l5" data-on={hoverLine === 5 ? 'yes' : 'no'}>{lines[5] ?? ''}</li>
						<li data-key="l6" data-on={hoverLine === 6 ? 'yes' : 'no'}>{lines[6] ?? ''}</li>
						<li data-key="l7" data-on={hoverLine === 7 ? 'yes' : 'no'}>{lines[7] ?? ''}</li>
						<li data-key="l8" data-on={hoverLine === 8 ? 'yes' : 'no'}>{lines[8] ?? ''}</li>
						<li data-key="l9" data-on={hoverLine === 9 ? 'yes' : 'no'}>{lines[9] ?? ''}</li>
						<li data-key="l10" data-on={hoverLine === 10 ? 'yes' : 'no'}>{lines[10] ?? ''}</li>
						<li data-key="l11" data-on={hoverLine === 11 ? 'yes' : 'no'}>{lines[11] ?? ''}</li>
					</ol>
				}
			</div>
			<div class="pane out-pane" data-busy={busy ? 'yes' : 'no'}>
				<div class="bar">
					<span class="file">compiled</span>
					<span class="count">{result.pieces.length} pieces</span>
				</div>
				<ul class="pieces">
					<li data-key="p0" data-shown={result.pieces[0] ? 'yes' : 'no'} data-on={hover === 'p0' || (hoverLine >= 0 && result.pieces[0]?.line === hoverLine) ? 'yes' : 'no'}>
						<code>{result.pieces[0]?.id ?? ''}</code>
						<span>{result.pieces[0]?.what ?? ''}</span>
					</li>
					<li data-key="p1" data-shown={result.pieces[1] ? 'yes' : 'no'} data-on={hover === 'p1' || (hoverLine >= 0 && result.pieces[1]?.line === hoverLine) ? 'yes' : 'no'}>
						<code>{result.pieces[1]?.id ?? ''}</code>
						<span>{result.pieces[1]?.what ?? ''}</span>
					</li>
					<li data-key="p2" data-shown={result.pieces[2] ? 'yes' : 'no'} data-on={hover === 'p2' || (hoverLine >= 0 && result.pieces[2]?.line === hoverLine) ? 'yes' : 'no'}>
						<code>{result.pieces[2]?.id ?? ''}</code>
						<span>{result.pieces[2]?.what ?? ''}</span>
					</li>
					<li data-key="p3" data-shown={result.pieces[3] ? 'yes' : 'no'} data-on={hover === 'p3' || (hoverLine >= 0 && result.pieces[3]?.line === hoverLine) ? 'yes' : 'no'}>
						<code>{result.pieces[3]?.id ?? ''}</code>
						<span>{result.pieces[3]?.what ?? ''}</span>
					</li>
					<li data-key="p4" data-shown={result.pieces[4] ? 'yes' : 'no'} data-on={hover === 'p4' || (hoverLine >= 0 && result.pieces[4]?.line === hoverLine) ? 'yes' : 'no'}>
						<code>{result.pieces[4]?.id ?? ''}</code>
						<span>{result.pieces[4]?.what ?? ''}</span>
					</li>
				</ul>
				<p class="errors" data-shown={result.errors.length ? 'yes' : 'no'}>{result.errors.join(' ')}</p>
			</div>
		</div>
		<p class="hover-caption" aria-hidden="true">{caption}</p>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.explorer {
				margin: var(--space-m) 0;
				container: explorer / inline-size;
			}

			.board {
				position: relative;
				aspect-ratio: 680 / 360;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--sheet-ink: var(--ink);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--sheet-ink: var(--paper);
				}
			}

			.frames {
				position: absolute;
				inset: 0;
				width: 100%;
				height: 100%;
				overflow: visible;
			}

			.paper {
				fill: var(--sheet);
			}

			.ink {
				fill: var(--sheet-ink);
			}

			.desk-ink {
				fill: var(--ink);
			}

			.shadow {
				fill: color-mix(in oklch, var(--ink) 20%, transparent);
			}

			.hatch {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.55;
			}

			.note {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
				fill: var(--ink);
			}

			.pane {
				position: absolute;
				top: 8.6%;
				bottom: 3.5%;
				display: flex;
				flex-direction: column;
				color: var(--sheet-ink);
			}

			.source-pane {
				left: 1.6%;
				width: 50%;
			}

			.out-pane {
				left: 57.8%;
				width: 41%;
			}

			.bar {
				display: flex;
				align-items: center;
				justify-content: space-between;
				min-height: 1.4rem;
				padding: 0 0.6rem;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: clamp(0.62rem, 2cqw, 0.85rem);
				font-weight: 700;
			}

			.edit {
				padding: 0.05rem 0.55rem;
				border: 1.4px solid var(--sheet-ink);
				border-radius: 0.6rem;
				background: color-mix(in oklch, var(--pink) 45%, var(--sheet));
				color: inherit;
				font: inherit;
				cursor: pointer;
			}

			.edit[aria-pressed='true'] {
				background: var(--yellow);
			}

			.lines {
				overflow-x: auto;
			}

			.lines,
			.pieces {
				margin: 0.3rem 0 0;
				padding: 0 0.5rem;
				list-style: none;
				font-family: var(--font-mono);
				font-size: clamp(0.5rem, 1.75cqw, 0.78rem);
			}

			.lines li {
				margin: 0;
				line-height: 1.35;
				tab-size: 2;
				font-family: var(--font-mono);
				min-height: 1.35em;
				padding: 0 0.3rem;
				border-radius: 0.3rem;
				white-space: pre;
				overflow: hidden;
				cursor: default;
			}

			.lines li[data-on='yes'],
			.pieces li[data-on='yes'] {
				background: color-mix(in oklch, var(--yellow) 70%, transparent);
			}

			.code-edit {
				flex: 1;
				margin: 0.3rem 0.5rem 0.4rem;
				padding: 0.3rem;
				border: 1px dashed var(--sheet-ink);
				border-radius: 0.3rem;
				background: transparent;
				color: inherit;
				font-family: var(--font-mono);
				font-size: clamp(0.5rem, 1.75cqw, 0.78rem);
				line-height: 1.35;
				resize: none;
				tab-size: 2;
			}

			.pieces li {
				line-height: 1.3;
				display: grid;
				gap: 0.05rem;
				margin-bottom: 0.4rem;
				padding: 0.25rem 0.4rem;
				border: 1px solid color-mix(in oklch, var(--sheet-ink) 45%, transparent);
				border-radius: 0.4rem;
				transition:
					opacity 250ms ease,
					background 150ms ease;
			}

			.pieces li[data-shown='no'] {
				opacity: 0;
			}

			.pieces span {
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.out-pane[data-busy='yes'] .pieces {
				opacity: 0.55;
			}

			.errors {
				margin: 0 0.5rem;
				font-family: var(--font-mono);
				font-size: clamp(0.5rem, 1.6cqw, 0.72rem);
				color: color-mix(in srgb, var(--pink) 70%, #c0403c);
			}

			.errors[data-shown='no'] {
				display: none;
			}

			.count {
				font-weight: 400;
				opacity: 0.8;
			}

			@container explorer (max-width: 560px) {
				.board {
					aspect-ratio: auto;
					display: grid;
					grid-template-columns: minmax(0, 1fr);
					gap: 0.8rem;
				}

				.frames {
					display: none;
				}

				.pane {
					position: static;
					width: auto;
					min-width: 0;
					min-height: 9rem;
					padding-bottom: 0.4rem;
					border: 1.5px solid var(--ink);
					border-radius: 0.5rem;
					background: var(--sheet);
				}

				.lines,
				.pieces,
				.code-edit {
					font-size: 0.72rem;
				}

				.code-edit {
					min-height: 14rem;
				}
			}

			.hover-caption {
				margin: 0.3rem 0 0;
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
