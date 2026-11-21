import { shared, state } from '@markless/core';

function addMonths(month: string, step: number): string {
	const parts = month.split('-');
	const at = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1 + step, 1));
	return `${at.getUTCFullYear()}-${`${at.getUTCMonth() + 1}`.padStart(2, '0')}`;
}

const monthState = shared(
	() => {
		const month = state({ at: '2026-11', open: false, peek: '' });
		return {
			...month,
			next() {
				month.at = addMonths(month.at, 1);
			},
			go(step: number) {
				month.at = addMonths(month.at, step);
			},
			setOpen(next: boolean) {
				month.open = next;
			},
		};
	},
	{ scope: 'subtree' },
);

function Forward() @{
	const month = monthState();
	<button
		onClick={() => {
			month.next();
		}}
	>Next</button>
}

function Jump() @{
	const month = monthState();
	<button onClick={() => month.go(-13)}>Back</button>
}

function Peek() @{
	const month = monthState();
	<button
		onClick={() => {
			const opening = month.open !== true;
			month.setOpen(opening);
			month.peek = opening ? addMonths(month.at, 1) : '';
		}}
	>Peek</button>
}

export default function SharedMonth() @{
	const month = monthState();
	<main ui-open={month.open}>
		<p>{month.at}</p>
		<p>{month.peek}</p>
		<Forward />
		<Jump />
		<Peek />
	</main>
}
