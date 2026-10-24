import Nav from '../src/nav.tsrx';

const rows = Array.from({ length: 4000 }, (_, index) => index);

export default function Large() @{
	<main data-page="large">
		<title>Large page</title>
		<Nav />
		@for (const index of rows; key index) {
			<p data-row={index}>A row of the large page, long enough that four thousand of them pass the idle budget.</p>
		}
	</main>
}
