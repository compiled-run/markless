import { state } from 'arcade';

export default function InteractiveCounter() @{
	let count = state(0);

	<section>
		<a href="javascript:history.back()" data-router-back>Back</a>
		<button data-mdx-counter onClick={() => count++}>MDX Count {count}</button>
	</section>
}
