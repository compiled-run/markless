// The values the chess-by-post figure shows, its tour and the sentence its live region speaks.
export type Kind = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type Piece = { readonly id: string; readonly kind: Kind; readonly white: boolean; readonly square: string };

/** The position the post brought, after 7. Bb3 d6 of an Italian game. */
export const PIECES: ReadonlyArray<Piece> = [
	{ id: 'wk', kind: 'king', white: true, square: 'g1' },
	{ id: 'wr', kind: 'rook', white: true, square: 'f1' },
	{ id: 'wb', kind: 'bishop', white: true, square: 'b3' },
	{ id: 'wn', kind: 'knight', white: true, square: 'f3' },
	{ id: 'wp1', kind: 'pawn', white: true, square: 'd3' },
	{ id: 'wp2', kind: 'pawn', white: true, square: 'e4' },
	{ id: 'wp3', kind: 'pawn', white: true, square: 'f2' },
	{ id: 'wp4', kind: 'pawn', white: true, square: 'g2' },
	{ id: 'wp5', kind: 'pawn', white: true, square: 'h2' },
	{ id: 'bk', kind: 'king', white: false, square: 'g8' },
	{ id: 'br', kind: 'rook', white: false, square: 'f8' },
	{ id: 'bb', kind: 'bishop', white: false, square: 'c5' },
	{ id: 'bn', kind: 'knight', white: false, square: 'c6' },
	{ id: 'bp1', kind: 'pawn', white: false, square: 'd6' },
	{ id: 'bp2', kind: 'pawn', white: false, square: 'e5' },
	{ id: 'bp3', kind: 'pawn', white: false, square: 'f7' },
	{ id: 'bp4', kind: 'pawn', white: false, square: 'g7' },
	{ id: 'bp5', kind: 'pawn', white: false, square: 'h7' },
];

/** The one piece the next move lifts, and where it lands. */
export const MOVER = 'wn';
export const FROM = 'f3';
export const TO = 'g5';
export const MOVE = 'Ng5';
export const SCORE = ['6. O-O\u00a0\u00a0\u00a0O-O', '7. Bb3\u00a0\u00a0\u00a0d6'] as const;
export const NEXT = '8.';
/** The misunderstanding, pencilled and crossed out on the sheet. */
export const REDO = 'set up again from 1. e4?';

/** Each press flips the beat, so the press animations restart. */
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const RESUME_TOUR = ['move', 'rest', 'rest', 'reset', 'rest'] as const;

export function describeResume(moved: boolean): string {
	if (!moved) return 'The board arrived set up mid-game, with the score sheet beside it.';
	return `Your move: the white knight went from ${FROM} to ${TO}, and ${MOVE} was written on the score sheet. The other ${PIECES.length - 1} pieces stayed where they stood, and nobody replayed the game from move one.`;
}
