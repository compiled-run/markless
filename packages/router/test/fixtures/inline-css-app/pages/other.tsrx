import Nav from '../src/nav.tsrx';
import Card from '../src/card.tsrx';
import '../styles/other.css';

export default function Other() @{
	<main data-page="other">
		<title>Other</title>
		<Nav />
		<h1 data-probe="title" data-title>{'Other'}</h1>
		<p data-probe="lead">{'A page with a card.'}</p>
		<Card title="Card" />
	</main>
}
