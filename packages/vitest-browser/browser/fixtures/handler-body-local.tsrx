import { state } from '@markless/core';

const SHELF = [
	{ code: 'ln', title: 'Lantern', aisle: 4 },
	{ code: 'rp', title: 'Rope', aisle: 9 },
];

function Picker({ onPick }: { readonly onPick: (mark: string) => void }) @{
	<button data-pick type="button" onClick={() => onPick('!')}>pick</button>
}

function Item({ code }: { readonly code: string }) @{
	const entry = SHELF.find((candidate) => candidate.code === code)!;
	const where = 'aisle ' + entry.aisle;
	let note = state('');
	<div>
		<button data-locate type="button" onClick={() => (note = entry.title + ' in ' + where)}>{entry.title}</button>
		<output data-note>{note}</output>
	</div>
}

export default function HandlerBodyLocal() @{
	const featured = SHELF.find((candidate) => candidate.aisle > 5)!;
	let picked = state('');
	<section>
		<Item code="rp" />
		<Picker onPick={(mark) => (picked = featured.code + mark)} />
		<output data-picked>{picked}</output>
	</section>
}
