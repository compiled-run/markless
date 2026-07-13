import { state } from '@markless/core';
import C1 from './chain-1-10.tsrx';

export default function App() @{
	let owner1 = state(0);
	let owner11 = state(0);
	let owner21 = state(0);
	let owner31 = state(0);
	let owner41 = state(0);
	let owner51 = state(0);
	let owner61 = state(0);
	let owner71 = state(0);
	let owner81 = state(0);
	let owner91 = state(0);

	<main id='computed-chain'>
		<div class='owner-actions'>
			<button type='button' data-owner='1' onClick={() => owner1++}>write 1</button>
			<button type='button' data-owner='11' onClick={() => owner11++}>write 11</button>
			<button type='button' data-owner='21' onClick={() => owner21++}>write 21</button>
			<button type='button' data-owner='31' onClick={() => owner31++}>write 31</button>
			<button type='button' data-owner='41' onClick={() => owner41++}>write 41</button>
			<button type='button' data-owner='51' onClick={() => owner51++}>write 51</button>
			<button type='button' data-owner='61' onClick={() => owner61++}>write 61</button>
			<button type='button' data-owner='71' onClick={() => owner71++}>write 71</button>
			<button type='button' data-owner='81' onClick={() => owner81++}>write 81</button>
			<button type='button' data-owner='91' onClick={() => owner91++}>write 91</button>
			<button type='button' data-equal='1' onClick={() => owner1 = owner1}>equal</button>
			<button type='button' data-batch='forward' onClick={() => { owner1++; owner11++; owner21++; owner31++; owner41++; owner51++; owner61++; owner71++; owner81++; owner91++; }}>batch forward</button>
			<button type='button' data-batch='reverse' onClick={() => { owner91++; owner81++; owner71++; owner61++; owner51++; owner41++; owner31++; owner21++; owner11++; owner1++; }}>batch reverse</button>
		</div>
		<C1 owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} />
	</main>
}
