import { element, state } from '@markless/core';

export default function App() @{
	let shown = state('none');
	const field = element<HTMLInputElement>();
	<main>
		<h1>Pick</h1>
		<input
			el={field}
			type="file"
			accept=".txt"
			multiple
			onChange={() => {
				if (field) shown = [...(field.files ?? [])].map((file) => `${file.name} ${file.size} ${file.type}`).join(', ');
			}}
		/>
		<button
			onClick={() => {
				field?.showPicker();
			}}
		>
			Choose
		</button>
		<p>{shown}</p>
	</main>
}
