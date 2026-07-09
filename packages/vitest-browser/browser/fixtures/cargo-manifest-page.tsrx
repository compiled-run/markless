import { CargoManifestForm } from './cargo-manifest-form.tsrx';

export function App() @{
	const lanes = [
		{ code: 'van', name: 'Van' },
		{ code: 'rail', name: 'Rail' },
		{ code: 'air', name: 'Air' },
	];

	<main>
		<h1>Cargo manifest</h1>
		<CargoManifestForm lanes={lanes} />
		<p data-after-form>Ready for dispatch</p>
	</main>
}
