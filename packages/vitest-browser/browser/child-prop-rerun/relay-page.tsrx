import { state } from '@markless/core';
import { Relay } from './relay.tsrx';

export default function RelayPage() @{
	let label = state('');
	<div>
		<button data-set onClick={() => (label = 'ready')}>Set</button>
		<button data-clear onClick={() => (label = '')}>Clear</button>
		<Relay label={label} />
	</div>
}
