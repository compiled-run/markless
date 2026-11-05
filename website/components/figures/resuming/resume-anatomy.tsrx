// A chess board left mid-game with three pieces and a score sheet. Press the board and the server's next move plays; hover, drag or use the keys to play the pieces yourself.
import { computed, state } from '@markless/core';
import { describeMove, describeRefusal, legal, nearestSquare, noteOf, placeOf, serverMove, sheetLines, START, START_SAID, stepped } from './model.ts';
import { art } from './board.art.ts';

const BK = art.pieces.find((piece) => piece.id === 'bk')!;
const WP = art.pieces.find((piece) => piece.id === 'wp')!;
const WN = art.pieces.find((piece) => piece.id === 'wn')!;

export default function ResumeAnatomy() @{
	let bkSq = state(START.bk!);
	let wpSq = state(START.wp!);
	let wnSq = state(START.wn!);
	let notes = state<string[]>([]);
	let said = state(START_SAID);
	let hover = state('');
	let held = state('');
	let picked = state('wn');
	let dragX = state(0);
	let dragY = state(0);
	let fromX = state(0);
	let fromY = state(0);
	let ratio = state(1);
	let dropped = state(0);
	let touched = state(false);
	const bkPlace = computed(() => placeOf(art.squares, 'bk', bkSq, held === 'bk' ? dragX : 0, held === 'bk' ? dragY : 0));
	const wpPlace = computed(() => placeOf(art.squares, 'wp', wpSq, held === 'wp' ? dragX : 0, held === 'wp' ? dragY : 0));
	const wnPlace = computed(() => placeOf(art.squares, 'wn', wnSq, held === 'wn' ? dragX : 0, held === 'wn' ? dragY : 0));
	const lines = computed(() => sheetLines(notes, 4));
	const fresh = computed(() => (notes.length > 0 ? 'yes' : 'no'));

	const squareOfPiece = (id: string) => (id === 'bk' ? bkSq : id === 'wp' ? wpSq : wnSq);
	const play = (id: string, to: string) => {
		const position = { bk: bkSq, wp: wpSq, wn: wnSq };
		const from = squareOfPiece(id);
		if (!legal(position, id, to)) {
			said = describeRefusal(id, to || 'off the board');
			return;
		}
		if (id === 'bk') bkSq = to;
		if (id === 'wp') wpSq = to;
		if (id === 'wn') wnSq = to;
		notes = [...notes, noteOf(id, to)];
		said = describeMove(id, from, to, 2);
	};
	const reset = () => {
		bkSq = START.bk!;
		wpSq = START.wp!;
		wnSq = START.wn!;
		notes = [];
		held = '';
		said = START_SAID;
	};
	const grab = (id: string, event: PointerEvent) => {
		touched = true;
		held = id;
		picked = id;
		fromX = event.clientX;
		fromY = event.clientY;
		dragX = 0;
		dragY = 0;
		const box = (event.currentTarget as Element).getBoundingClientRect();
		ratio = box && box.width > 0 ? art.width / box.width : 1;
	};

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				hover = hover === 'wn' ? '' : 'wn';
			}, 1800);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label="Chess board. Press for the server's next move; arrow keys move the chosen piece; 1, 2 and 3 choose a piece."
			onClick={() => {
				if (Date.now() - dropped < 400) return;
				if (hover) {
					touched = true;
					picked = hover;
					return;
				}
				touched = true;
				const to = serverMove({ bk: bkSq, wp: wpSq, wn: wnSq });
				if (to) play('wn', to);
			}}
			onKeyDown={(event) => {
				touched = true;
				if (event.key === 'Escape') reset();
				if (event.key === '1') picked = 'bk';
				if (event.key === '2') picked = 'wp';
				if (event.key === '3') picked = 'wn';
				if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
					event.preventDefault();
					play(picked, stepped(squareOfPiece(picked), event.key));
				}
			}}
		>
			<svg
				class="scene"
				viewBox={'0 0 ' + art.width + ' ' + art.height}
				aria-hidden="true"
				onPointerdown={(event) => {
					if (hover) grab(hover, event);
				}}
				onPointermove={(event) => {
					if (!held && event.buttons === 1 && hover) grab(hover, event);
					if (!held) return;
					dragX = (event.clientX - fromX) * ratio;
					dragY = (event.clientY - fromY) * ratio;
				}}
				onPointerup={() => {
					if (!held) return;
					const id = held;
					const moved = Math.hypot(dragX, dragY) > 6;
					if (moved) {
						const [x, y] = art.squares[squareOfPiece(id)]!;
						const to = nearestSquare(art.squares, x + dragX, y + dragY);
						play(id, to);
						dropped = Date.now();
					}
					held = '';
					dragX = 0;
					dragY = 0;
				}}
				onPointerleave={() => {
					hover = '';
					held = '';
					dragX = 0;
					dragY = 0;
				}}
			>
				<path class="desk-hatch" d={art.desk} />
				<path class="shadow-wash" d={art.board.cast.wash} />
				<path class="hatch light" d={art.board.cast.hatch} />
				<path class="paper" d={art.board.paper} />
				<path class="wash kraft" d={art.board.rimTone} />
				<path class="hatch" d={art.board.dark} />
				<path class="hatch light" d={art.board.front} />
				<path class="hatch" d={art.board.side} />
				<path class="ink" d={art.board.ink} />

				<path class="shadow-wash" d={art.sheet.cast} />
				<path class="paper" d={art.sheet.paper} />
				<path class="ink" d={art.sheet.ink} />
				<g class="newest" data-on={fresh}>
					<path class="wash yellow" d={art.sheet.spot.wash} />
					<path class="wash yellow pool" d={art.sheet.spot.pool} />
				</g>
				<text class="hand-text score" transform={art.sheet.lines[0]}>{lines[0]}</text>
				<text class="hand-text score" transform={art.sheet.lines[1]}>{lines[1]}</text>
				<text class="hand-text score" transform={art.sheet.lines[2]}>{lines[2]}</text>
				<text class="hand-text score" transform={art.sheet.lines[3]}>{lines[3]}</text>

				<g
					class="piece"
					data-hover={hover === 'bk' ? 'yes' : 'no'}
					data-held={held === 'bk' ? 'yes' : 'no'}
					data-picked={picked === 'bk' && touched ? 'yes' : 'no'}
					style={bkPlace}
					onPointerenter={() => (hover = 'bk')}
					onPointerleave={() => (hover = '')}
				>
					<path class="shadow-wash cast" d={BK.cast} />
					<g class="lift">
						<path class="paper" d={BK.paper} />
						<path class="tone" d={BK.tone} />
						<path class="ink" d={BK.ink} />
						<path class="paper" d={BK.topPaper} />
						<path class="tone" d={BK.topTone} />
						<path class="ink" d={BK.topInk} />
					</g>
					<text class="square-label" x={art.squares[START.bk]![0] + 16} y={art.squares[START.bk]![1] + 4}>{bkSq}</text>
				</g>
				<g
					class="piece"
					data-hover={hover === 'wp' ? 'yes' : 'no'}
					data-held={held === 'wp' ? 'yes' : 'no'}
					data-picked={picked === 'wp' && touched ? 'yes' : 'no'}
					style={wpPlace}
					onPointerenter={() => (hover = 'wp')}
					onPointerleave={() => (hover = '')}
				>
					<path class="shadow-wash cast" d={WP.cast} />
					<g class="lift">
						<path class="paper" d={WP.paper} />
						<path class="tone" d={WP.tone} />
						<path class="ink" d={WP.ink} />
						<path class="paper" d={WP.topPaper} />
						<path class="tone" d={WP.topTone} />
						<path class="ink" d={WP.topInk} />
					</g>
					<text class="square-label" x={art.squares[START.wp]![0] + 16} y={art.squares[START.wp]![1] + 4}>{wpSq}</text>
				</g>
				<g
					class="piece"
					data-hover={hover === 'wn' ? 'yes' : 'no'}
					data-held={held === 'wn' ? 'yes' : 'no'}
					data-picked={picked === 'wn' && touched ? 'yes' : 'no'}
					style={wnPlace}
					onPointerenter={() => (hover = 'wn')}
					onPointerleave={() => (hover = '')}
				>
					<path class="shadow-wash cast" d={WN.cast} />
					<g class="lift">
						<path class="paper" d={WN.paper} />
						<path class="tone" d={WN.tone} />
						<path class="ink" d={WN.ink} />
						<path class="paper" d={WN.topPaper} />
						<path class="tone" d={WN.topTone} />
						<path class="ink" d={WN.topInk} />
					</g>
					<text class="square-label" x={art.squares[START.wn]![0] + 16} y={art.squares[START.wn]![1] + 4}>{wnSq}</text>
				</g>

				<path class="desk-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>LEFT MID-GAME</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a chess board on a desk, left mid-game with three pieces: a black king on g8, a white pawn on e4 and a
			white knight on f3, with a blank score sheet beside it. Press the board, or Enter or Space, for the server's next move: only the
			knight moves, to g5, and the move is written on the score sheet. Nothing else moves, and the board is never set up again. You can
			also drag a piece, or choose one with 1, 2 or 3 and move it with the arrow keys; a legal move is played and written down, and an
			illegal one slides back. Escape sets the board back.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
				container: anatomy / inline-size;
			}

			.stage {
				display: block;
				width: 100%;
				padding: 0;
				border: 0;
				background: none;
				color: inherit;
				cursor: pointer;
				border-radius: 12px;
			}

			.stage:focus-visible {
				outline: 2px dashed var(--ink);
				outline-offset: 4px;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--shade: color-mix(in oklch, var(--ink) 22%, transparent);
				--sheet-ink: var(--ink);

				html.dark & {
					--sheet-ink: var(--paper);
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--shade: rgb(0 0 0 / 0.5);
				}
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

			.desk-hatch {
				fill: none;
				stroke: var(--ink);
				stroke-width: 0.7;
				stroke-linecap: round;
				opacity: 0.45;
			}

			.hatch,
			.tone {
				fill: none;
				stroke: var(--sheet-ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.55;
			}

			.shadow-wash {
				fill: var(--shade);
			}

			.wash {
				stroke-width: 1.2;
				mix-blend-mode: multiply;

				html.dark & {
					mix-blend-mode: normal;
				}
			}

			.kraft {
				fill: oklch(72% 0.07 65);
				stroke: oklch(72% 0.07 65);
				opacity: 0.35;
			}

			.yellow {
				fill: var(--yellow);
				stroke: var(--yellow);
				opacity: 0.85;
			}

			.pool {
				fill: color-mix(in oklch, var(--yellow) 70%, oklch(70% 0.16 70));
				stroke: none;
				opacity: 0.5;
			}

			.pencil {
				fill: none;
				stroke: color-mix(in srgb, var(--pink) 70%, #e0603c);
				stroke-width: 0.8;
				stroke-linecap: round;
				stroke-dasharray: 2 3;
				opacity: 0.7;
			}

			.rim-text,
			.sheet-title {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 4.4px;
				font-weight: 700;
				fill: var(--sheet-ink);
			}

			.sheet-title {
				font-size: 5.2px;
			}

			.hand-text {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 4.6px;
				fill: var(--sheet-ink);
			}

			.score {
				font-size: 10px;
			}

			.pencil-text {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 4.2px;
				fill: color-mix(in srgb, var(--pink) 70%, #e0603c);
				opacity: 0.85;
			}

			.hand {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 13px;
				letter-spacing: 0.16em;
				fill: var(--ink);
			}

			@container anatomy (max-width: 520px) {
				.hand {
					font-size: 21px;
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

			.piece {
				cursor: grab;
				transition: transform 420ms cubic-bezier(0.3, 0.7, 0.4, 1);
			}

			.piece[data-held='yes'] {
				cursor: grabbing;
				transition: none;
			}

			.lift,
			.cast {
				transition: transform 180ms ease;
			}

			.piece[data-hover='yes'] .lift,
			.piece[data-held='yes'] .lift {
				transform: translateY(-9px);
			}

			.piece[data-hover='yes'] .cast,
			.piece[data-held='yes'] .cast {
				transform: translate(7px, 3px);
				opacity: 0.7;
			}

			.square-label {
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 17px;
				fill: var(--sheet-ink);
				opacity: 0;
				transition: opacity 160ms ease;
				pointer-events: none;
			}

			.piece[data-hover='yes'] .square-label,
			.piece[data-held='yes'] .square-label,
			.piece[data-picked='yes'] .square-label {
				opacity: 1;
			}

			.newest {
				opacity: 0;
				transition: opacity 300ms ease;
			}

			.newest[data-on='yes'] {
				opacity: 1;
			}
		</style>
	</figure>
}
