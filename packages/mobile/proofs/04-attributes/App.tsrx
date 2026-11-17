import { state } from '@markless/core';

export default function App() @{
	let liked = state(false);
	<main>
		<style>
			.like.on {
				background: #ef476f;
			}
		</style>
		<h1>Attributes</h1>
		<button
			class={liked ? 'like on' : 'like'}
			aria-label={liked ? 'Unlike' : 'Like'}
			aria-pressed={liked}
			onClick={() => (liked = !liked)}
		>
			Heart
		</button>
		<button disabled={!liked} onClick={() => (liked = false)}>Clear</button>
	</main>
}
