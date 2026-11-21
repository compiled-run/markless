import { state } from '@markless/core';
import { navigate } from '@markless/router';

export default function Home() @{
	let next = state(41);
	let note = state('Nothing yet');
	<main>
		<title>Home</title>
		<h1>Order desk</h1>
		<p>{note}</p>
		<button
			onClick={async () => {
				next++;
				await navigate(`/orders/${next}`);
			}}
		>
			Open next order
		</button>
		<button
			onClick={async () => {
				await navigate('./');
				note = 'Stayed on this page';
			}}
		>
			Stay here
		</button>
		<button
			onClick={async () => {
				try {
					await navigate('/orders/../nowhere?from=desk');
				} catch (error) {
					note = (error as Error).message;
				}
			}}
		>
			Try a missing page
		</button>
	</main>
}
