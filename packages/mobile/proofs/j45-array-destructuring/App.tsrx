import { state } from '@markless/core';

type File = { readonly name: string };

function Files({ files }: { readonly files: readonly File[] }) @{
	const [first, , third] = files;
	let picked = state('None picked');
	<section>
		<button onClick={() => (picked = `Picked ${first.name}`)}>{first.name}</button>
		@if (third) {
			<button onClick={() => (picked = `Picked ${third.name}`)}>{third.name}</button>
		} @else {
			<p>{`No third file after ${first.name}`}</p>
		}
		<p>{picked}</p>
	</section>
}

export default function App() @{
	<main>
		<h1>Files</h1>
		<Files files={[{ name: 'app.ts' }, { name: 'skip.ts' }, { name: 'page.ts' }]} />
		<Files files={[{ name: 'only.ts' }]} />
	</main>
}
