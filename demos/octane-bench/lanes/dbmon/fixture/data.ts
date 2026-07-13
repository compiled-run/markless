export const DB_COUNT = 1_000;
export const QUERIES_PER_DB = 5;
export const PARTIAL_COUNT = DB_COUNT / 10;

export type DatabaseRow = {
	id: number;
	name: string;
	count: string;
	countClass: string;
	query0: string; query0Class: string;
	query1: string; query1Class: string;
	query2: string; query2Class: string;
	query3: string; query3Class: string;
	query4: string; query4Class: string;
};

function mulberry32(seed: number): () => number {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

function elapsedClass(elapsed: number): string {
	if (elapsed >= 10) return 'elapsed warn-long';
	if (elapsed >= 1) return 'elapsed warn';
	return 'elapsed short';
}

function countClass(count: number): string {
	if (count >= 20) return 'label label-important';
	if (count >= 10) return 'label label-warning';
	return 'label label-success';
}

export function makeData(idBase: number, frame: number): DatabaseRow[] {
	const random = mulberry32(frame);
	return Array.from({ length: DB_COUNT }, (_, index) => {
		const id = idBase + index;
		const count = (random() * 30) | 0;
		const queries = Array.from({ length: QUERIES_PER_DB }, () => {
			const elapsed = random() * 15;
			return { elapsed: elapsed.toFixed(2), className: elapsedClass(elapsed) };
		});
		return {
			id,
			name: `cluster-${id}`,
			count: String(count),
			countClass: countClass(count),
			query0: queries[0].elapsed, query0Class: queries[0].className,
			query1: queries[1].elapsed, query1Class: queries[1].className,
			query2: queries[2].elapsed, query2Class: queries[2].className,
			query3: queries[3].elapsed, query3Class: queries[3].className,
			query4: queries[4].elapsed, query4Class: queries[4].className,
		};
	});
}

export function partialTick(rows: DatabaseRow[], frame: number): DatabaseRow[] {
	const fresh = makeData(rows[0]?.id ?? 0, frame);
	return rows.map((row, index) => (index < PARTIAL_COUNT ? fresh[index] : row));
}

export function reorder(rows: DatabaseRow[], direction: number): DatabaseRow[] {
	return rows.slice().sort((left, right) =>
		direction * (Number(right.count) - Number(left.count)) || left.id - right.id,
	);
}
