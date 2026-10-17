import Banner from '../src/banner.tsrx';
import Counter from '../src/counter.tsrx';

export default function Home() @{
	<main data-page="home">
		<title>Styled children</title>
		<Banner title="Static child" />
		<Counter />
	</main>
}
