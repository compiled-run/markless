import { Nav } from './Nav.tsrx';

function Inner() @{
	<strong>Inner</strong>
}

export function BareTagName() @{
	<section></*TAG_CHILDREN*/</section>
}
