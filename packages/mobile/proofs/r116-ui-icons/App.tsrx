import { state } from '@markless/core';
import { lucide } from '@markless/ui';

export default function App() @{
	let likes = state(0);
	<main>
		<h1>Icons</h1>
		<button onClick={() => likes++}>
			<lucide.heart title="Like" />
		</button>
		<div>
			<lucide.menu aria-hidden="true" />
			<span>Liked {likes} times</span>
		</div>
	</main>
}
