import { choice } from './choice.tsrx';

export function ChoiceReader() @{
	const c = choice();
	<p data-shown>{c.value}</p>
}
