// Chess by post on the desk: the board arrives set up mid-game with its score sheet, and a press makes one move without replaying the game.
import { computed, state } from '@markless/core';
import { describeResume, flip, MOVE, NEXT, PIECES, REDO, RESUME_TOUR, SCORE } from './model.ts';
import { art } from './board.art.ts';

export default function ResumeAnatomy() @{
	let moved = state(false);
	let beat = state('rest');
	let touched = state(false);
	const said = computed(() => describeResume(moved));
	const played = computed(() => (moved ? 'yes' : 'no'));
	const play = () => {
		moved = true;
		beat = flip(beat);
	};
	const reset = () => {
		moved = false;
		beat = 'rest';
	};

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			let step = 0;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				const next = RESUME_TOUR[step % RESUME_TOUR.length];
				step++;
				if (next === 'move') play();
				if (next === 'reset') reset();
			}, 2600);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
	>
		<button
			type="button"
			class="stage"
			aria-label="Make the next move"
			onClick={() => {
				touched = true;
				if (moved) reset();
				else play();
			}}
			onKeyDown={(event) => {
				if (event.key === 'Escape') {
					touched = true;
					reset();
				}
			}}
		>
			<svg class="scene" data-beat={beat} data-moved={played} style={art.move} viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
				<path class="desk-hatch" d={art.desk} />
				<path class="shadow-wash" d={art.board.cast.wash} />
				<path class="hatch light" d={art.board.cast.hatch} />
				<path class="shadow-wash" d={art.envelope.cast} />
				<path class="shadow-wash" d={art.sheet.cast} />

				<path class="paper" d={art.board.paper} />
				<path class="wash kraft" d={art.board.rimTone} />
				<path class="hatch" d={art.board.dark} />
				<path class="hatch light" d={art.board.front} />
				<path class="hatch" d={art.board.side} />
				<path class="ink" d={art.board.ink} />
				@for (const file of art.board.files; key file.letter) {
					<text class="rim-text" transform={file.matrix}>{file.letter}</text>
				}
				@for (const rank of art.board.ranks; key rank.rank) {
					<text class="rim-text" transform={rank.matrix}>{rank.rank}</text>
				}
				<g class="landing">
					<path class="wash yellow" d={art.board.landing.wash} />
					<path class="wash yellow pool" d={art.board.landing.pool} />
				</g>
				<path class="pencil route" d={art.board.path} />

				@for (const piece of art.pieces; key piece.id) {
					<g class="piece" data-mover={piece.id === art.mover ? 'yes' : 'no'}>
						<path class="shadow-wash" d={piece.cast} />
						<g class="lift">
							<path class="paper" d={piece.paper} />
							<path class="tone" d={piece.tone} />
							<path class="ink" d={piece.ink} />
						</g>
					</g>
				}

				<path class="paper" d={art.envelope.paper} />
				<path class="hatch light" d={art.envelope.tone} />
				<path class="ink" d={art.envelope.ink} />
				<path class="paper" d={art.envelope.stamp.paper} />
				<path class="wash kraft" d={art.envelope.stamp.wash} />
				<path class="hatch light" d={art.envelope.stamp.hatch} />
				<path class="ink" d={art.envelope.stamp.ink} />
				<path class="ink" d={art.envelope.postmark} />
				<text class="hand-text" transform={art.envelope.fromMatrix}>From: the server</text>
				<text class="hand-text" transform={art.envelope.toMatrix}>To: your browser</text>

				<path class="paper" d={art.sheet.paper} />
				<path class="ink" d={art.sheet.ink} />
				<text class="sheet-title" transform={art.sheet.titleMatrix}>Game in progress</text>
				<text class="hand-text score" transform={art.sheet.lineMatrices[0]}>{SCORE[0]}</text>
				<text class="hand-text score" transform={art.sheet.lineMatrices[1]}>{SCORE[1]}</text>
				<g class="slot">
					<path class="wash yellow" d={art.sheet.spot.wash} />
					<path class="wash yellow pool" d={art.sheet.spot.pool} />
				</g>
				<text class="hand-text score" transform={art.sheet.nextMatrix}>{NEXT}</text>
				<text class="hand-text score written" transform={art.sheet.moveMatrix}>{MOVE}</text>
				<text class="pencil-text" transform={art.sheet.redoMatrix}>{REDO}</text>
				<path class="ink" d={art.sheet.redoStrike} />

				<path class="desk-ink" d={art.note.arrow} />
				<text class="hand" x={art.note.x} y={art.note.y}>THE SERVER LEFT IT MID-GAME</text>
			</svg>
		</button>
		<figcaption class="sr">
			A pen-and-ink drawing of a desk. A chessboard sits on it mid-game, {PIECES.length} pieces standing where the last move left them.
			Beside it lies the envelope the position came in, addressed from the server to your browser, and a score sheet with the moves so
			far and a blank for move 8. At the foot of the sheet, a pencilled note asking to set the board up again from the first move is crossed out. Press the drawing, or Enter or Space, to make the next move: only the white knight lifts and lands two
			squares on, and {MOVE} is written on the score sheet. No other piece moves, and nobody sets the board up again from the start.
			Press again to take the move back, or Escape.
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
				font-size: 7px;
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

			.landing,
			.slot,
			.written,
			.route {
				opacity: 0;
				transition: opacity 400ms ease;
			}

			.scene[data-moved='yes'] .landing,
			.scene[data-moved='yes'] .slot,
			.scene[data-moved='yes'] .written,
			.scene[data-moved='yes'] .route {
				opacity: 1;
			}

			.scene[data-moved='yes'] .route {
				opacity: 0.7;
			}

			.scene[data-moved='yes'] .written {
				transition-delay: 900ms;
			}

			.scene[data-moved='yes'] .slot {
				transition-delay: 700ms;
			}

			.piece[data-mover='yes'] {
				transition: transform 900ms cubic-bezier(0.4, 0, 0.2, 1);
			}

			.scene[data-moved='yes'] .piece[data-mover='yes'] {
				transform: translate(var(--dx), var(--dy));
			}

			.scene[data-beat='odd'] .piece[data-mover='yes'] .lift {
				animation: hop-a 900ms ease-in-out;
			}

			.scene[data-beat='even'] .piece[data-mover='yes'] .lift {
				animation: hop-b 900ms ease-in-out;
			}

			@keyframes hop-a {
				50% {
					transform: translateY(var(--up));
				}
			}

			@keyframes hop-b {
				50% {
					transform: translateY(var(--up));
				}
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
		</style>
	</figure>
}
