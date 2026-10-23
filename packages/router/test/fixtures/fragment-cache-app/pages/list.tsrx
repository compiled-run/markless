import { count } from '../src/count.ts';

export default function Page() @{
	const shown = String(count());
	<main data-page="list">
		<output data-count>{shown}</output>
		<a href="/" data-home>Home</a>
	</main>
}
