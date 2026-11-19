import { state } from '@markless/core';

export default function PressLeave() @{
	const seen = state({ log: '' });
	<main>
		<p>{seen.log}</p>
		<div onPointerleave={() => (seen.log = `${seen.log} box-left`)}>
			<button
				onPointerdown={(event) => (seen.log = `${seen.log} ${event.pointerType}-down`)}
				onPointerup={() => (seen.log = `${seen.log} up`)}
				onPointercancel={() => (seen.log = `${seen.log} cancelled`)}
				onPointerleave={() => (seen.log = `${seen.log} left`)}
			>
				Hold
			</button>
		</div>
	</main>
}
