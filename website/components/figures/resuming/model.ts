// The chess toy's rules: where each piece stands, which moves are legal, how a move is written, and what the live region says.
export type Kind = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type Piece = { readonly id: string; readonly kind: Kind; readonly white: boolean; readonly square: string };
export type Position = Readonly<Record<string, string>>;

/** The position worked out ahead of time: three pieces, mid-game. */
export const PIECES: ReadonlyArray<Piece> = [
	{ id: 'bk', kind: 'king', white: false, square: 'g8' },
	{ id: 'wp', kind: 'pawn', white: true, square: 'e4' },
	{ id: 'wn', kind: 'knight', white: true, square: 'f3' },
];

export const START: Position = Object.fromEntries(PIECES.map((p) => [p.id, p.square]));
/** The next move when the reader presses the board. */
export const MOVER = 'wn';
export const FROM = 'f3';
export const TO = 'g5';
export const FILES = 'abcdefgh';

const kindOf = (id: string) => PIECES.find((p) => p.id === id)!;
const coords = (square: string): [number, number] => [FILES.indexOf(square[0]!), Number(square[1])];
export const squareOf = (file: number, rank: number) => (file >= 0 && file < 8 && rank >= 1 && rank <= 8 ? FILES[file]! + rank : '');

/** Whether `id` may move to `to` from where it stands, by its own rules, onto an empty square. */
export function legal(position: Position, id: string, to: string): boolean {
	const from = position[id];
	if (!from || !to || from === to) return false;
	if (Object.values(position).includes(to)) return false;
	const [f0, r0] = coords(from);
	const [f1, r1] = coords(to);
	const df = Math.abs(f1 - f0);
	const dr = r1 - r0;
	const piece = kindOf(id);
	if (piece.kind === 'knight') return (df === 1 && Math.abs(dr) === 2) || (df === 2 && Math.abs(dr) === 1);
	if (piece.kind === 'king') return Math.max(df, Math.abs(dr)) === 1;
	if (piece.kind === 'pawn') {
		const step = piece.white ? 1 : -1;
		const home = piece.white ? 2 : 7;
		return df === 0 && (dr === step || (r0 === home && dr === 2 * step));
	}
	return false;
}

/** How the move is written on the score sheet: the piece letter, then the square. */
export function noteOf(id: string, to: string): string {
	const letter = { king: 'K', knight: 'N', pawn: '', rook: 'R', bishop: 'B', queen: 'Q' }[kindOf(id).kind];
	return letter + to;
}

/** One square along an arrow key, or '' off the board. */
export function stepped(square: string, key: string): string {
	const [f, r] = coords(square);
	if (key === 'ArrowLeft') return squareOf(f - 1, r);
	if (key === 'ArrowRight') return squareOf(f + 1, r);
	if (key === 'ArrowUp') return squareOf(f, r + 1);
	if (key === 'ArrowDown') return squareOf(f, r - 1);
	return '';
}

/** The next move: the knight to g5, or its first other legal square if g5 is taken. */
export function nextMove(position: Position): string {
	if (legal(position, MOVER, TO)) return TO;
	const [f, r] = coords(position[MOVER]!);
	for (const [a, b] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]] as const) {
		const to = squareOf(f + a, r + b);
		if (to && legal(position, MOVER, to)) return to;
	}
	return '';
}

export const nameOf = (id: string) => {
	const piece = kindOf(id);
	return `${piece.white ? 'white' : 'black'} ${piece.kind}`;
};

export function describeMove(id: string, from: string, to: string, others: number): string {
	return `The ${nameOf(id)} moved from ${from} to ${to}. The other ${others} pieces stayed where they were, and the game did not start over.`;
}

export const describeRefusal = (id: string, to: string) => `The ${nameOf(id)} cannot move to ${to}, so it slid back.`;

export const START_SAID = 'A chess board left mid-game with three pieces. Press the board for the next move, or drag a piece.';

/** The square whose centre lies nearest a point on the drawing. */
export function nearestSquare(squares: Readonly<Record<string, readonly [number, number]>>, x: number, y: number): string {
	let best = '';
	let gap = Infinity;
	for (const [square, [sx, sy]] of Object.entries(squares)) {
		const d = Math.hypot(sx - x, (sy - y) * 1.6);
		if (d < gap) {
			gap = d;
			best = square;
		}
	}
	return best;
}

/** The screen offset that carries a piece from its starting square to `square`, plus any drag in progress. */
export function placeOf(squares: Readonly<Record<string, readonly [number, number]>>, id: string, square: string, dx: number, dy: number): string {
	const a = squares[START[id]!]!;
	const b = squares[square]!;
	return `transform:translate(${Math.round((b[0] - a[0] + dx) * 10) / 10}px,${Math.round((b[1] - a[1] + dy) * 10) / 10}px)`;
}

/** The score sheet's lines, newest first, numbered from the first move played here. */
export function sheetLines(notes: ReadonlyArray<string>, rows: number): string[] {
	const out: string[] = [];
	for (let i = 0; i < rows; i++) {
		const n = notes.length - 1 - i;
		out.push(n >= 0 ? `${n + 1}. ${notes[n]}` : '');
	}
	return out;
}
