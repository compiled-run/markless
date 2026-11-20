import { state } from '@markless/core';

export default function ScrollTarget() @{
	let top = state(0);
	let left = state(0);
	<main>
		<div onScroll={(event) => { top = (event.target as HTMLElement).scrollTop; left = (event.currentTarget as HTMLElement).scrollLeft; }}>
			<p>Tall</p>
		</div>
		<p>{top} down, {left} across</p>
	</main>
}
