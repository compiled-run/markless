import { state } from '@markless/core';
import { Btn } from './btn.tsrx';

function Relay({ to, onPress }: { readonly to: string; readonly onPress?: () => void }) @{
	<Btn data-relay={to} onClick={() => onPress?.()}>{to}</Btn>
}

export default function Handed() @{
	const page = state({ last: '' });
	<main>
		<Relay to="none" />
		<Relay to="dark" onPress={() => { page.last = 'dark'; }} />
		<Relay to="light" onPress={() => { page.last = 'light'; }} />
		<output data-last="">{page.last}</output>
	</main>
}
