import { state } from 'arcade';
import { Link } from 'arcade/router';

export default function InteractiveCounter() @{
	let count = state(0);
	let input = state('off');
	let boosts = state(0);

	<section>
		<button data-mdx-counter onClick={() => count++}>MDX Count {count}</button>
		<label>
			<input
				data-mdx-input
				value="MDX Input"
				onInput={() => input = 'on'}
			/>
			<span data-mdx-input-state>MDX Input {input}</span>
		</label>
		<button data-mdx-boost onClick={() => boosts++}>MDX Boost {boosts}</button>
		<Link href="/" data-router-home>Home</Link>
	</section>
}
