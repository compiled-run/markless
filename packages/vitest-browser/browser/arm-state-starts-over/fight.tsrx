import { state } from '@markless/core';

export default function Fight() @{
	let level = state(1);
	let fighting = state(false);

	<section>
		@if (fighting) {
			let bossHp = state(900);

			<div>
				<p data-count>{bossHp}</p>
				<button data-hit onClick={() => (bossHp -= 100 * level)}>Hit</button>
			</div>
		} @else {
			<p>Camp, level {level}</p>
		}
		<button data-train onClick={() => level++}>Train</button>
		<button data-toggle onClick={() => (fighting = !fighting)}>{fighting ? 'Run' : 'Fight'}</button>
	</section>
}
