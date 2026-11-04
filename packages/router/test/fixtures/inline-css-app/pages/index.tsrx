import Nav from '../src/nav.tsrx';
import Counter from '../src/counter.tsrx';
import '../styles/home.css';

export default function Home() @{
	<main data-page="home">
		<title>Home</title>
		<Nav />
		<h1 data-probe="title" data-title>{'Home'}</h1>
		<p class="home-lead" data-probe="lead">{'A page with a counter.'}</p>
		<Counter />
	</main>
}
