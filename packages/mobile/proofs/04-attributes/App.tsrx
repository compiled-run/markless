import { state } from '@markless/core';

export default function App() @{
	let liked = state(false);
	<main>
		<style>
			button {
				display: block;
				font-family: inherit;
				font-size: 18px;
				margin-top: 12px;
				padding: 10px 18px;
				border: 2px solid #22223b;
				border-radius: 10px;
				background: #e9ecef;
				color: #22223b;
			}
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
