// The chess toy's rules: where each piece stands, which moves are legal (captures included; check, castling and en passant left out), how a move is written, and how the side to move replies.
export type Kind = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type Piece = { readonly id: string; readonly kind: Kind; readonly white: boolean; readonly square: string };
/** Where each piece on the board stands; a captured piece has no entry. */
export type Position = Readonly<Record<string, string>>;

/** The position worked out ahead of time: mid-game, white to play move 9. */
export const PIECES: ReadonlyArray<Piece> = [
	{ id: 'bk', kind: 'king', white: false, square: 'g8' },
	{ id: 'br', kind: 'rook', white: false, square: 'f8' },
	{ id: 'bn', kind: 'knight', white: false, square: 'c6' },
	{ id: 'bb', kind: 'bishop', white: false, square: 'b4' },
	{ id: 'bp', kind: 'pawn', white: false, square: 'e5' },
	{ id: 'wp', kind: 'pawn', white: true, square: 'e4' },
	{ id: 'wb', kind: 'bishop', white: true, square: 'c4' },
	{ id: 'wn', kind: 'knight', white: true, square: 'f3' },
	{ id: 'wr', kind: 'rook', white: true, square: 'f1' },
	{ id: 'wk', kind: 'king', white: true, square: 'g1' },
];

export const START: Position = Object.fromEntries(PIECES.map((p) => [p.id, p.square]));
/** The move number the score sheet starts on: the game is already under way. */
export const FIRST_MOVE = 9;
export const FILES = 'abcdefgh';

const pieceOf = (id: string) => PIECES.find((p) => p.id === id)!;
const coords = (square: string): [number, number] => [FILES.indexOf(square[0]!), Number(square[1])];
export const squareOf = (file: number, rank: number) => (file >= 0 && file < 8 && rank >= 1 && rank <= 8 ? FILES[file]! + rank : '');
export const whoIsOn = (position: Position, square: string) => Object.keys(position).find((id) => position[id] === square) ?? '';
/** White moves on even plies, counting from the position worked out ahead of time. */
export const whiteToMove = (plies: number) => plies % 2 === 0;

const RAYS: Record<string, ReadonlyArray<readonly [number, number]>> = {
	rook: [[1, 0], [-1, 0], [0, 1], [0, -1]],
	bishop: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
	queen: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
};
const KNIGHT: ReadonlyArray<readonly [number, number]> = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = RAYS.queen!;

/** Every square `id` can move to from where it stands: empty squares, plus enemy pieces other than the king, which it captures. */
export function movesOf(position: Position, id: string): string[] {
	const from = position[id];
	if (!from) return [];
	const piece = pieceOf(id);
	const [f, r] = coords(from);
	const out: string[] = [];
	const enemy = (square: string) => {
		const other = whoIsOn(position, square);
		return other !== '' && pieceOf(other).white !== piece.white && pieceOf(other).kind !== 'king';
	};
	const empty = (square: string) => whoIsOn(position, square) === '';
	const step = (df: number, dr: number) => {
		const to = squareOf(f + df, r + dr);
		if (to && (empty(to) || enemy(to))) out.push(to);
	};
	if (piece.kind === 'knight') for (const [a, b] of KNIGHT) step(a, b);
	else if (piece.kind === 'king') for (const [a, b] of KING) step(a, b);
	else if (piece.kind === 'pawn') {
		const dir = piece.white ? 1 : -1;
		const one = squareOf(f, r + dir);
		if (one && empty(one)) {
			out.push(one);
			const two = squareOf(f, r + 2 * dir);
			if (r === (piece.white ? 2 : 7) && two && empty(two)) out.push(two);
		}
		for (const side of [-1, 1]) {
			const take = squareOf(f + side, r + dir);
			if (take && enemy(take)) out.push(take);
		}
	} else
		for (const [a, b] of RAYS[piece.kind]!) {
			for (let k = 1; k < 8; k++) {
				const to = squareOf(f + a * k, r + b * k);
				if (!to) break;
				if (empty(to)) out.push(to);
				else {
					if (enemy(to)) out.push(to);
					break;
				}
			}
		}
	return out;
}

export const legal = (position: Position, id: string, to: string) => movesOf(position, id).includes(to);

/** The position after `id` moves to `to`, with any piece standing there taken off the board. */
export function after(position: Position, id: string, to: string): Position {
	const taken = whoIsOn(position, to);
	const next: Record<string, string> = {};
	for (const [other, square] of Object.entries(position)) if (other !== taken) next[other] = other === id ? to : square;
	return next;
}

const LETTER: Record<Kind, string> = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: '' };

/** The move as written on a score sheet: Nxe5, Bb5, dxe5. */
export function noteOf(position: Position, id: string, to: string): string {
	const piece = pieceOf(id);
	const takes = whoIsOn(position, to) !== '';
	const letter = piece.kind === 'pawn' && takes ? position[id]![0]! : LETTER[piece.kind];
	return letter + (takes ? 'x' : '') + to;
}

const CENTRE = (square: string) => {
	const [f, r] = coords(square);
	return Math.abs(f - 3.5) + Math.abs(r - 4.5);
};

/** The reply rule: the first capture the side to move has, in board order; otherwise a knight or bishop stepping toward the centre; otherwise its first legal move. */
export function reply(position: Position, white: boolean): { id: string; to: string } | undefined {
	const mine = PIECES.filter((p) => p.white === white && position[p.id]);
	for (const p of mine) {
		const to = movesOf(position, p.id).find((square) => whoIsOn(position, square) !== '');
		if (to) return { id: p.id, to };
	}
	for (const p of mine.filter((q) => q.kind === 'knight' || q.kind === 'bishop')) {
		const to = movesOf(position, p.id).find((square) => CENTRE(square) < CENTRE(position[p.id]!));
		if (to) return { id: p.id, to };
	}
	for (const p of mine) {
		const to = movesOf(position, p.id)[0];
		if (to) return { id: p.id, to };
	}
	return undefined;
}

export const nameOf = (id: string) => {
	const piece = pieceOf(id);
	return `${piece.white ? 'white' : 'black'} ${piece.kind}`;
};
export const isWhite = (id: string) => pieceOf(id).white;

export function describeMove(position: Position, id: string, to: string): string {
	const taken = whoIsOn(position, to);
	return `The ${nameOf(id)} moved from ${position[id]} to ${to}${taken ? `, taking the ${nameOf(taken)}` : ''}. Nothing else moved, and the game did not start over.`;
}

export const describeRefusal = (id: string, to: string) => `The ${nameOf(id)} cannot move to ${to}, so it slid back.`;
export const describeTurn = (white: boolean) => `It is ${white ? 'white' : 'black'}'s move, so that piece slid back.`;

export const START_SAID = 'A chess game left mid-game. Drag a piece to a dotted square, or press Next move and the side to move replies from where the game stands.';

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
	const b = squares[square || START[id]!]!;
	return `transform:translate(${Math.round((b[0] - a[0] + dx) * 10) / 10}px,${Math.round((b[1] - a[1] + dy) * 10) / 10}px)`;
}

/** The score sheet's lines, newest first: white's moves as "9. Nxe5", black's as "9… Nxe5". */
export function sheetLines(notes: ReadonlyArray<string>, rows: number): string[] {
	const out: string[] = [];
	for (let i = 0; i < rows; i++) {
		const n = notes.length - 1 - i;
		out.push(n >= 0 ? `${FIRST_MOVE + Math.floor(n / 2)}${n % 2 === 0 ? '.' : '…'} ${notes[n]}` : '');
	}
	return out;
}
