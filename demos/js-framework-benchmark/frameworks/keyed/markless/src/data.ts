export type Row = {
	id: number;
	label: string;
};

const adjectives = [
	'pretty',
	'large',
	'big',
	'small',
	'tall',
	'short',
	'long',
	'handsome',
	'plain',
	'quaint',
	'clean',
	'elegant',
	'easy',
	'angry',
	'crazy',
	'helpful',
	'mushy',
	'odd',
	'unsightly',
	'adorable',
	'important',
	'inexpensive',
	'cheap',
	'expensive',
	'fancy',
];
const colours = [
	'red',
	'yellow',
	'blue',
	'green',
	'pink',
	'brown',
	'purple',
	'brown',
	'white',
	'black',
	'orange',
];
const nouns = [
	'table',
	'chair',
	'house',
	'bbq',
	'desk',
	'car',
	'pony',
	'cookie',
	'sandwich',
	'burger',
	'pizza',
	'mouse',
	'keyboard',
];

let nextId = 1;

export function buildData(count: number): Row[] {
	const rows: Row[] = [];
	for (let index = 0; index < count; index++) {
		rows.push({
			id: nextId++,
			label: `${random(adjectives)} ${random(colours)} ${random(nouns)}`,
		});
	}
	return rows;
}

export function appendRows(rows: Row[], count: number): Row[] {
	return [...rows, ...buildData(count)];
}

export function updateEveryTenth(rows: Row[]): Row[] {
	return rows.map((row, index) =>
		index % 10 === 0 ? { id: row.id, label: `${row.label} !!!` } : row,
	);
}

export function removeRow(rows: Row[], id: number): Row[] {
	return rows.filter((row) => row.id !== id);
}

export function swapRows(rows: Row[]): Row[] {
	if (rows.length <= 998) return rows;
	const nextRows = [...rows];
	const row = nextRows[1]!;
	nextRows[1] = nextRows[998]!;
	nextRows[998] = row;
	return nextRows;
}

function random(values: string[]) {
	return values[Math.floor(Math.random() * values.length)]!;
}
