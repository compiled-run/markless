type Mark = { readonly key: number; readonly d: string };
type Word = { readonly key: number; readonly text: string };
type Row = {
	readonly key: number;
	readonly job: string;
	readonly hover: { readonly paths: ReadonlyArray<Mark> };
	readonly pending: { readonly paths: ReadonlyArray<Mark>; readonly texts: ReadonlyArray<Word> };
};

const row = (key: number, job: string): Row => ({
	key,
	job,
	hover: { paths: [{ key: 0, d: 'M0 0' }] },
	pending: {
		paths: [
			{ key: 0, d: 'M1 1' },
			{ key: 1, d: 'M2 2' },
		],
		texts: [{ key: 0, text: job }],
	},
});

export const art: { readonly rows: ReadonlyArray<Row> } = {
	rows: [row(0, 'lint'), row(1, 'unit'), row(2, 'test')],
};
