import { Choice } from './choice.tsrx';

function Pair({ name }: { readonly name: string }) @{
	<span><Choice to="dark" name={name} /><Choice to="light" name={name} /></span>
}

export default function Imported() @{
	<main><Pair name="one" /><Pair name="two" /></main>
}
