import { state } from '@markless/core';

const LINES = [
	'Filler line 1',
	'Filler line 2',
	'Filler line 3',
	'Filler line 4',
	'Filler line 5',
	'Filler line 6',
	'Filler line 7',
	'Filler line 8',
	'Filler line 9',
	'Filler line 10',
	'Filler line 11',
	'Filler line 12',
	'Filler line 13',
	'Filler line 14',
	'Filler line 15',
	'Filler line 16',
	'Filler line 17',
	'Filler line 18',
	'Filler line 19',
	'Filler line 20',
	'Filler line 21',
	'Filler line 22',
	'Filler line 23',
	'Filler line 24',
	'Filler line 25',
	'Filler line 26',
	'Filler line 27',
	'Filler line 28',
	'Filler line 29',
	'Filler line 30',
	'Filler line 31',
	'Filler line 32',
	'Filler line 33',
	'Filler line 34',
	'Filler line 35',
	'Filler line 36',
	'Filler line 37',
	'Filler line 38',
	'Filler line 39',
	'Filler line 40',
	'Filler line 41',
	'Filler line 42',
	'Filler line 43',
	'Filler line 44',
	'Filler line 45',
	'Filler line 46',
	'Filler line 47',
	'Filler line 48',
	'Filler line 49',
	'Filler line 50',
	'Filler line 51',
	'Filler line 52',
	'Filler line 53',
	'Filler line 54',
	'Filler line 55',
	'Filler line 56',
	'Filler line 57',
	'Filler line 58',
	'Filler line 59',
	'Filler line 60',
];

export default function App() @{
	let seen = state('');
	let open = state(false);
	<main>
		<p>{`Seen ${seen === '' ? 'nothing' : seen}`}</p>
		<p onVisible={() => (seen = seen + 'T')}>Top line</p>
		<button onClick={() => (open = true)}>Reveal</button>
		@if (open) {
			<p onVisible={() => (seen = seen + 'R')}>Revealed line</p>
		}
		@for (const line of LINES; key line) {
			<p>{line}</p>
		}
		<p onVisible={() => (seen = seen + 'B')}>Bottom line</p>
	</main>
}
