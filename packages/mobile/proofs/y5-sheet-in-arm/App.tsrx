import { state } from '@markless/core';
import { native, platform } from '@markless/device';

export default function App() @{
	let ready = state(false);
	let choosing = state(false);
	let picked = state('nothing');
	<main>
		<h1>Colours</h1>
		<p>Picked {picked}</p>
		<button onClick={() => (ready = !ready)}>{ready ? 'Hide choices' : 'Show choices'}</button>
		@if (ready) {
			<>
				<button onClick={() => (choosing = true)}>Choose a colour</button>
				@if (!platform.web) {
					<native.sheet open={choosing} onChange={(open) => (choosing = open)} snapPoints={[0.5]}>
						<h2>Pick one</h2>
						<button
							onClick={() => {
								picked = 'red';
								choosing = false;
							}}
						>
							Red
						</button>
						<button onClick={() => (ready = false)}>Put away</button>
					</native.sheet>
				}
			</>
		}
	</main>
}
