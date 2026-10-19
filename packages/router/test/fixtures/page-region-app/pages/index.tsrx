import { state } from '@markless/core';
import Layout from '../src/layout.tsrx';

export default function Home() @{
	let count = state(0);

	<Layout name="home">
		<button type="button" data-bump onClick={() => count++}>Bump</button>
		<output data-count>{count}</output>
	</Layout>
}
