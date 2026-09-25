import { state } from '@markless/core';

export default function RorNested() @{
	let picked = state('x');
	let lanes = state([
		{ id: 'x', cells: [{ id: 'x1', lane: 'x' }, { id: 'x2', lane: 'x' }] },
		{ id: 'y', cells: [{ id: 'y1', lane: 'y' }] },
	]);
	<main>
		<button type="button" data-pick-y onClick={() => (picked = 'y')}>y</button>
		<button type="button" data-pick-z onClick={() => (picked = 'z')}>z</button>
		<button type="button" data-add-z onClick={() => (lanes = [...lanes, { id: 'z', cells: [{ id: 'z1', lane: 'z' }] }])}>add</button>
		<div>
			@for (const lane of lanes; key lane.id) {
				<section data-lane={lane.id} class={picked === lane.id ? 'lit' : 'dim'}>
					<ol>
						@for (const cell of lane.cells; key cell.id) {
							<li data-cell={cell.id} class={picked === cell.lane ? 'lit' : 'dim'}>{cell.id}</li>
						}
					</ol>
				</section>
			}
		</div>
	</main>
}
