// A chess game left mid-game, beside its score sheet. Drag any piece of the side to move to a dotted square, or press Next move: the side to move replies from where the game stands, and nothing replays from move one.
import { computed, state } from '@markless/core';
import { after, describeMove, describeRefusal, describeTurn, isWhite, legal, movesOf, nameOf, nearestSquare, noteOf, PIECES, placeOf, type Position, reply, sheetLines, START, START_SAID, whiteToMove } from './model.ts';
import { art } from './board.art.ts';

const ART = Object.fromEntries(art.pieces.map((piece) => [piece.id, piece]));
const IDS = PIECES.map((piece) => piece.id);

export default function ResumeAnatomy() @{
	let pos = state<Position>(START);
	let notes = state<string[]>([]);
	let said = state(START_SAID);
	let hover = state('');
	let pointed = state('');
	let held = state('');
	let picked = state('');
	let aim = state('');
	let dragX = state(0);
	let dragY = state(0);
	let fromX = state(0);
	let fromY = state(0);
	let ratio = state(1);
	let dropped = state(0);
	let touched = state(false);
	const white = computed(() => whiteToMove(notes.length));
	const targets = computed(() => {
		const id = held || picked;
		return id && pos[id] ? movesOf(pos, id) : [];
	});
	const dotsPath = computed(() => targets.map((square) => art.dots[square]).join(''));
	const aimPath = computed(() => (aim && targets.includes(aim) ? art.dots[aim]! : ''));
	const places = computed(() => Object.fromEntries(IDS.map((id) => [id, placeOf(art.squares, id, pos[id] ?? '', held === id ? dragX : 0, held === id ? dragY : 0)])));
	const caption = computed(() => {
		const id = held || hover || pointed || picked;
		if (id && pos[id]) {
			const n = movesOf(pos, id).length;
			return nameOf(id) + ' on ' + pos[id] + ': ' + (n === 1 ? '1 legal move' : n + ' legal moves');
		}
		return (white ? 'White' : 'Black') + ' to move. Drag a piece to a dotted square, or press Next move.';
	});
	const lines = computed(() => sheetLines(notes, 4));
	const fresh = computed(() => (notes.length > 0 ? 'yes' : 'no'));
	const turnLabel = computed(() => (white ? 'white to move' : 'black to move'));

	const play = (id: string, to: string) => {
		if (!pos[id]) return;
		if (isWhite(id) !== white) {
			said = describeTurn(white);
			return;
		}
		if (!legal(pos, id, to)) {
			said = describeRefusal(id, to || 'off the board');
			return;
		}
		said = describeMove(pos, id, to);
		notes = [...notes, noteOf(pos, id, to)];
		pos = after(pos, id, to);
		picked = '';
		aim = '';
	};
	const next = () => {
		touched = true;
		const move = reply(pos, white);
		if (move) play(move.id, move.to);
		else said = 'The side to move has no legal move left. Press Escape to set the board back.';
	};
	const reset = () => {
		pos = START;
		notes = [];
		held = '';
		picked = '';
		aim = '';
		said = START_SAID;
	};
	const pick = (id: string) => {
		if (isWhite(id) !== white) {
			said = describeTurn(white);
			picked = '';
			return;
		}
		picked = picked === id ? '' : id;
		aim = '';
	};
	const grab = (id: string, event: PointerEvent) => {
		touched = true;
		held = id;
		fromX = event.clientX;
		fromY = event.clientY;
		dragX = 0;
		dragY = 0;
		const box = (event.target as Element | null)?.closest?.('svg')?.getBoundingClientRect();
		ratio = box && box.width > 0 ? art.width / box.width : 1;
	};
	const cycle = <T,>(list: readonly T[], current: T, step: number) => list[(list.indexOf(current) + step + list.length) % list.length];

	<figure class="anatomy">
		<button
			type="button"
			class="stage"
			aria-label="Chess board, left mid-game. Enter plays the next move for the side to move. Left and right arrows choose a piece, up and down choose a square for it, Enter plays it; Escape sets the board back."
			onClick={(event) => {
				if (Date.now() - dropped < 400) return;
				touched = true;
				const id = (event.target as Element | null)?.closest?.('[data-piece]')?.getAttribute('data-piece') ?? '';
				if (id && pos[id] && isWhite(id) === white) {
					pick(id);
					return;
				}
				if (picked) {
					const box = (event.currentTarget as Element).querySelector('svg')!.getBoundingClientRect();
					const scale = box.width > 0 ? art.width / box.width : 1;
					const square = nearestSquare(art.squares, (event.clientX - box.left) * scale, (event.clientY - box.top) * scale);
					if (id && targets.includes(pos[id]!)) play(picked, pos[id]!);
					else if (targets.includes(square)) play(picked, square);
					else picked = '';
					return;
				}
				if (id && pos[id]) {
					pick(id);
					return;
				}
				if (event.detail === 0) return;
				next();
			}}
			onKeyDown={(event) => {
				if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.preventDefault();
				touched = true;
				if (event.key === 'Escape') reset();
				if (event.key === 'Enter' || event.key === ' ') {
					if (picked && aim) play(picked, aim);
					else next();
				}
				if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
					const mine = IDS.filter((id) => pos[id] && isWhite(id) === white && movesOf(pos, id).length > 0);
					const chosen = cycle(mine, picked, event.key === 'ArrowRight' ? 1 : -1) ?? '';
					picked = chosen;
					aim = '';
					if (chosen) said = 'Chose the ' + nameOf(chosen) + ' on ' + pos[chosen] + '. Up and down choose a square.';
				}
				if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && picked) {
					const square = cycle(targets, aim, event.key === 'ArrowDown' ? 1 : -1) ?? '';
					aim = square;
					if (square) said = 'Aiming at ' + square + '. Enter plays it.';
				}
			}}
		>
			<svg
				class="scene"
				viewBox={'0 0 ' + art.width + ' ' + art.height}
				aria-hidden="true"
				onPointerdown={(event) => {
					const id = (event.target as Element | null)?.closest?.('[data-piece]')?.getAttribute('data-piece');
					if (id) grab(id, event);
				}}
				onPointermove={(event) => {
					if (!held && event.buttons === 1) {
						const id = (event.target as Element | null)?.closest?.('[data-piece]')?.getAttribute('data-piece');
						if (id) grab(id, event);
					}
					if (!held) return;
					dragX = (event.clientX - fromX) * ratio;
					dragY = (event.clientY - fromY) * ratio;
				}}
				onPointerup={() => {
					if (!held) return;
					const id = held;
					if (Math.hypot(dragX, dragY) > 6) {
						const [x, y] = art.squares[pos[id]!]!;
						const square = nearestSquare(art.squares, x + dragX, y + dragY);
						const [sx, sy] = art.squares[square]!;
						if (Math.hypot(sx - x - dragX, sy - y - dragY) > 34) said = 'The ' + nameOf(id) + ' was dropped off the board, so it slid back.';
						else play(id, square);
						dropped = Date.now();
					}
					held = '';
					dragX = 0;
					dragY = 0;
				}}
				onPointercancel={() => {
					held = '';
					dragX = 0;
					dragY = 0;
				}}
				onPointerleave={(event) => {
					held = '';
					dragX = 0;
					dragY = 0;
					if (event.pointerType === 'touch') return;
					hover = '';
					pointed = '';
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
				<path class="dots" d={dotsPath} />
				<path class="aim" d={aimPath} />

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
				<text class="pencil-text crossed" transform={art.sheet.crossed.matrix}>set up again from 1. e4?</text>
				<path class="strike" d={art.sheet.crossed.strike} />

				<g
					class="piece"
					onTouchmove={(event) => event.preventDefault()}
					data-piece="br"
					data-gone={pos.br ? 'no' : 'yes'}
					data-hover={hover === 'br' ? 'yes' : 'no'}
					data-held={held === 'br' ? 'yes' : 'no'}
					data-picked={picked === 'br' ? 'yes' : 'no'}
					style={places.br}
					onPointerenter={() => {
						touched = true;
						hover = 'br';
						pointed = 'br';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="shadow-wash cast" d={ART.br!.cast} />
					<g class="lift">
						<path class="paper" d={ART.br!.paper} />
						<path class="tone" d={ART.br!.tone} />
						<path class="ink" d={ART.br!.ink} />
						<path class="paper" d={ART.br!.topPaper} />
						<path class="tone" d={ART.br!.topTone} />
						<path class="ink" d={ART.br!.topInk} />
					</g>
				</g>
				<g
					class="piece"
					onTouchmove={(event) => event.preventDefault()}
					data-piece="bk"
					data-gone={pos.bk ? 'no' : 'yes'}
					data-hover={hover === 'bk' ? 'yes' : 'no'}
					data-held={held === 'bk' ? 'yes' : 'no'}
					data-picked={picked === 'bk' ? 'yes' : 'no'}
					style={places.bk}
					onPointerenter={() => {
						touched = true;
						hover = 'bk';
						pointed = 'bk';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="shadow-wash cast" d={ART.bk!.cast} />
					<g class="lift">
						<path class="paper" d={ART.bk!.paper} />
						<path class="tone" d={ART.bk!.tone} />
						<path class="ink" d={ART.bk!.ink} />
						<path class="paper" d={ART.bk!.topPaper} />
						<path class="tone" d={ART.bk!.topTone} />
						<path class="ink" d={ART.bk!.topInk} />
					</g>
				</g>
				<g
					class="piece"
					onTouchmove={(event) => event.preventDefault()}
					data-piece="bn"
					data-gone={pos.bn ? 'no' : 'yes'}
					data-hover={hover === 'bn' ? 'yes' : 'no'}
					data-held={held === 'bn' ? 'yes' : 'no'}
					data-picked={picked === 'bn' ? 'yes' : 'no'}
					style={places.bn}
					onPointerenter={() => {
						touched = true;
						hover = 'bn';
						pointed = 'bn';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="shadow-wash cast" d={ART.bn!.cast} />
					<g class="lift">
						<path class="paper" d={ART.bn!.paper} />
						<path class="tone" d={ART.bn!.tone} />
						<path class="ink" d={ART.bn!.ink} />
						<path class="paper" d={ART.bn!.topPaper} />
						<path class="tone" d={ART.bn!.topTone} />
						<path class="ink" d={ART.bn!.topInk} />
					</g>
				</g>
				<g
					class="piece"
					onTouchmove={(event) => event.preventDefault()}
					data-piece="bb"
					data-gone={pos.bb ? 'no' : 'yes'}
					data-hover={hover === 'bb' ? 'yes' : 'no'}
					data-held={held === 'bb' ? 'yes' : 'no'}
					data-picked={picked === 'bb' ? 'yes' : 'no'}
					style={places.bb}
					onPointerenter={() => {
						touched = true;
						hover = 'bb';
						pointed = 'bb';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="shadow-wash cast" d={ART.bb!.cast} />
					<g class="lift">
						<path class="paper" d={ART.bb!.paper} />
						<path class="tone" d={ART.bb!.tone} />
						<path class="ink" d={ART.bb!.ink} />
						<path class="paper" d={ART.bb!.topPaper} />
						<path class="tone" d={ART.bb!.topTone} />
						<path class="ink" d={ART.bb!.topInk} />
					</g>
				</g>
				<g
					class="piece"
					onTouchmove={(event) => event.preventDefault()}
					data-piece="bp"
					data-gone={pos.bp ? 'no' : 'yes'}
					data-hover={hover === 'bp' ? 'yes' : 'no'}
					data-held={held === 'bp' ? 'yes' : 'no'}
					data-picked={picked === 'bp' ? 'yes' : 'no'}
					style={places.bp}
					onPointerenter={() => {
						touched = true;
						hover = 'bp';
						pointed = 'bp';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="shadow-wash cast" d={ART.bp!.cast} />
					<g class="lift">
						<path class="paper" d={ART.bp!.paper} />
						<path class="tone" d={ART.bp!.tone} />
						<path class="ink" d={ART.bp!.ink} />
						<path class="paper" d={ART.bp!.topPaper} />
						<path class="tone" d={ART.bp!.topTone} />
						<path class="ink" d={ART.bp!.topInk} />
					</g>
				</g>
				<g
					class="piece"
					onTouchmove={(event) => event.preventDefault()}
					data-piece="wb"
					data-gone={pos.wb ? 'no' : 'yes'}
					data-hover={hover === 'wb' ? 'yes' : 'no'}
					data-held={held === 'wb' ? 'yes' : 'no'}
					data-picked={picked === 'wb' ? 'yes' : 'no'}
					style={places.wb}
					onPointerenter={() => {
						touched = true;
						hover = 'wb';
						pointed = 'wb';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="shadow-wash cast" d={ART.wb!.cast} />
					<g class="lift">
						<path class="paper" d={ART.wb!.paper} />
						<path class="tone" d={ART.wb!.tone} />
						<path class="ink" d={ART.wb!.ink} />
						<path class="paper" d={ART.wb!.topPaper} />
						<path class="tone" d={ART.wb!.topTone} />
						<path class="ink" d={ART.wb!.topInk} />
					</g>
				</g>
				<g
					class="piece"
					onTouchmove={(event) => event.preventDefault()}
					data-piece="wp"
					data-gone={pos.wp ? 'no' : 'yes'}
					data-hover={hover === 'wp' ? 'yes' : 'no'}
					data-held={held === 'wp' ? 'yes' : 'no'}
					data-picked={picked === 'wp' ? 'yes' : 'no'}
					style={places.wp}
					onPointerenter={() => {
						touched = true;
						hover = 'wp';
						pointed = 'wp';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="shadow-wash cast" d={ART.wp!.cast} />
					<g class="lift">
						<path class="paper" d={ART.wp!.paper} />
						<path class="tone" d={ART.wp!.tone} />
						<path class="ink" d={ART.wp!.ink} />
						<path class="paper" d={ART.wp!.topPaper} />
						<path class="tone" d={ART.wp!.topTone} />
						<path class="ink" d={ART.wp!.topInk} />
					</g>
				</g>
				<g
					class="piece"
					onTouchmove={(event) => event.preventDefault()}
					data-piece="wn"
					data-gone={pos.wn ? 'no' : 'yes'}
					data-hover={hover === 'wn' ? 'yes' : 'no'}
					data-held={held === 'wn' ? 'yes' : 'no'}
					data-picked={picked === 'wn' ? 'yes' : 'no'}
					style={places.wn}
					onPointerenter={() => {
						touched = true;
						hover = 'wn';
						pointed = 'wn';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="shadow-wash cast" d={ART.wn!.cast} />
					<g class="lift">
						<path class="paper" d={ART.wn!.paper} />
						<path class="tone" d={ART.wn!.tone} />
						<path class="ink" d={ART.wn!.ink} />
						<path class="paper" d={ART.wn!.topPaper} />
						<path class="tone" d={ART.wn!.topTone} />
						<path class="ink" d={ART.wn!.topInk} />
					</g>
				</g>
				<g
					class="piece"
					onTouchmove={(event) => event.preventDefault()}
					data-piece="wr"
					data-gone={pos.wr ? 'no' : 'yes'}
					data-hover={hover === 'wr' ? 'yes' : 'no'}
					data-held={held === 'wr' ? 'yes' : 'no'}
					data-picked={picked === 'wr' ? 'yes' : 'no'}
					style={places.wr}
					onPointerenter={() => {
						touched = true;
						hover = 'wr';
						pointed = 'wr';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="shadow-wash cast" d={ART.wr!.cast} />
					<g class="lift">
						<path class="paper" d={ART.wr!.paper} />
						<path class="tone" d={ART.wr!.tone} />
						<path class="ink" d={ART.wr!.ink} />
						<path class="paper" d={ART.wr!.topPaper} />
						<path class="tone" d={ART.wr!.topTone} />
						<path class="ink" d={ART.wr!.topInk} />
					</g>
				</g>
				<g
					class="piece"
					onTouchmove={(event) => event.preventDefault()}
					data-piece="wk"
					data-gone={pos.wk ? 'no' : 'yes'}
					data-hover={hover === 'wk' ? 'yes' : 'no'}
					data-held={held === 'wk' ? 'yes' : 'no'}
					data-picked={picked === 'wk' ? 'yes' : 'no'}
					style={places.wk}
					onPointerenter={() => {
						touched = true;
						hover = 'wk';
						pointed = 'wk';
					}}
					onPointerleave={() => (hover = '')}
				>
					<path class="shadow-wash cast" d={ART.wk!.cast} />
					<g class="lift">
						<path class="paper" d={ART.wk!.paper} />
						<path class="tone" d={ART.wk!.tone} />
						<path class="ink" d={ART.wk!.ink} />
						<path class="paper" d={ART.wk!.topPaper} />
						<path class="tone" d={ART.wk!.topTone} />
						<path class="ink" d={ART.wk!.topInk} />
					</g>
				</g>

				<path class="desk-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>LEFT MID-GAME</text>
			</svg>
		</button>
		<div class="controls">
			<span class="turn">{turnLabel}</span>
			<button type="button" class="next" onClick={next}>Next move</button>
		</div>
		<p class="hover-caption" aria-hidden="true">{caption}</p>
		<figcaption class="sr">
			A pen-and-ink drawing of a chess board on a desk, left mid-game with ten pieces, beside a score sheet that starts at move 9. In
			pencil at the foot of the sheet, "set up again from 1. e4?" is crossed out. Drag any piece of the side to move: ink dots mark its
			legal squares, a legal move is played and written on the sheet, and an illegal one slides back. Press Next move, or the board, and
			the side to move replies from the position as it stands: its first capture, otherwise a knight or bishop stepping toward the
			centre. Nothing ever replays from move one. Escape sets the board back.
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
				touch-action: pan-y;
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
				touch-action: none;
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

			.dots,
			.aim {
				fill: var(--sheet-ink);
				opacity: 0.55;
				pointer-events: none;
			}

			.aim {
				opacity: 1;
				stroke: var(--yellow);
				stroke-width: 6;
				paint-order: stroke;
			}

			.piece[data-gone='yes'] {
				display: none;
			}

			.crossed {
				font-size: 4.6px;
			}

			.strike {
				fill: color-mix(in srgb, var(--pink) 70%, #e0603c);
			}

			.controls {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 0.9rem;
				margin-top: 0.3rem;
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.turn {
				font-size: 0.9rem;
				opacity: 0.85;
			}

			.next {
				padding: 0.2rem 0.9rem;
				border: 1.5px solid var(--ink);
				border-radius: 0.7rem;
				background: var(--yellow);
				color: oklch(24% 0.01 70);
				font: inherit;
				font-weight: 700;
				box-shadow: 2px 2px 0 var(--ink);
				cursor: pointer;
			}

			.next:active {
				translate: 1px 1px;
				box-shadow: 1px 1px 0 var(--ink);
			}

			.hover-caption {
				margin: 0.3rem 0 0;
				min-height: 1.4em;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 0.95rem;
				text-align: center;
				color: var(--ink);
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
