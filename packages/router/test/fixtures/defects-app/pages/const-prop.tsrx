import { SayButton } from '../src/say-button.tsrx';

export default function ConstPropPage() @{
	const greeting = 'hello';
	<main>
		<SayButton word={greeting} />
	</main>;
}
