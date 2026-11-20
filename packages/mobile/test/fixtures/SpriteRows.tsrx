import { state } from '@markless/core';

export default function SpriteRows() @{
	let marks = state([{ id: 'p', mark: 'dot' }, { id: 'q', mark: 'bar' }, { id: 'r', mark: 'dot' }]);
	<main>
		<button onClick={() => (marks = [...marks].reverse())}>Reverse</button>
		<button onClick={() => (marks = marks.filter((one) => one.id !== 'q'))}>Drop q</button>
		<button onClick={() => (marks = marks.map((one) => (one.id === 'p' ? { ...one, mark: 'bar' } : one)))}>Swap p</button>
		<button onClick={() => (marks = marks.map((one) => (one.id === 'r' ? { ...one, mark: 'gone' } : one)))}>Lose r</button>
		@for (const one of marks; key one.id) {
			<svg viewBox="0 0 2 2" width="20" height="20"><use href={'/marks.svg#' + one.mark} /></svg>
		}
	</main>
}
