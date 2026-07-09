export function App() @{
	<main>
		<button type="button" data-effect-only onClick={() => {
			throw new Error('effect only');
		}}>Effect</button>
	</main>
}
