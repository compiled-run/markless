import { state } from '@markless/core';

export default function AnimationEvents() @{
	let open = state(true);
	let seen = state('none');
	<main>
		<div
			class="panel"
			hidden={!open}
			onAnimationStart={(event) => (seen = `start ${event.animationName}`)}
			onAnimationEnd={(event) => {
				seen = `end ${event.animationName} after ${event.elapsedTime}s`;
				open = false;
			}}
		>
			Panel
		</div>
		<p>{seen}</p>
	</main>
}
