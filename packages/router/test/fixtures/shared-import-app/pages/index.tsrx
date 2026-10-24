import { Picker, picker } from '../components/pickers.tsrx';

export default function Home() @{
	const p = picker();
	<main>
		<Picker />
		<p data-page>{p.v}</p>
	</main>
}
