import { Nav } from './Nav.tsrx';

export function ComponentPropsMistyped() @{
	<Nav label={42}>paired</Nav>
}
