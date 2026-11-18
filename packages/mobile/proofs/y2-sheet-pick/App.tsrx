import { state } from '@markless/core';
import { native } from '@markless/ui';

export default function App() @{
	let picking = state(false);
	let city = state('');
	let shipTo = state('nowhere yet');
	<main>
		<h1>Checkout</h1>
		<p>Ship to {shipTo}</p>
		<button onClick={() => (picking = true)}>Choose city</button>
		<native.sheet open={picking} onChange={(open) => (picking = open)} snapPoints={[0.5, 1]}>
			<h2>Choose a city</h2>
			<input aria-label="City" value={city} onInput={(event) => (city = event.currentTarget.value)} />
			<button
				onClick={() => {
					shipTo = city;
					picking = false;
				}}
			>
				Use {city}
			</button>
			<ul>
				<li>
					<button
						onClick={() => {
							shipTo = 'Lisbon';
							picking = false;
						}}
					>
						Lisbon
					</button>
				</li>
				<li>
					<button
						onClick={() => {
							shipTo = 'Osaka';
							picking = false;
						}}
					>
						Osaka
					</button>
				</li>
				<li>
					<button
						onClick={() => {
							shipTo = 'Quito';
							picking = false;
						}}
					>
						Quito
					</button>
				</li>
			</ul>
		</native.sheet>
	</main>
}
