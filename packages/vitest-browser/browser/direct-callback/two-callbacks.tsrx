import { state } from '@markless/core';
import Press from './press.tsrx';

function Key({ to, onPress }: { readonly to: string; readonly onPress?: () => void }) @{
	<button type="button" data-key={to} onClick={onPress}>{to}</button>
}

export default function TwoCallbacks() @{
	const page = state({ last: '' });
	<section>
		<Key to="none" />
		<Key to="dark" onPress={() => { page.last = 'dark'; }} />
		<Key to="light" onPress={() => { page.last = 'light'; }} />
		<Press label="none">none</Press>
		<Press label="up" onPress={() => { page.last = 'up'; }}>up</Press>
		<Press label="down" onPress={(event) => { page.last = 'down ' + event.type; }}>down</Press>
		<output data-last="">{page.last}</output>
	</section>
}
