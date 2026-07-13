import { computed, state } from '@markless/core';
import { counted } from './counted.ts';
import C21 from './chain-21-30.tsrx';

function C20({ input20 }) @{
	const value20 = computed(() => counted(20, input20));
	<div class='c' data-level='20'><output data-value='20'>{value20}</output><C21 input21={value20} /></div>
}

function C19({ input19 }) @{
	const value19 = computed(() => counted(19, input19));
	<div class='c' data-level='19'><output data-value='19'>{value19}</output><C20 input20={value19} /></div>
}

function C18({ input18 }) @{
	const value18 = computed(() => counted(18, input18));
	<div class='c' data-level='18'><output data-value='18'>{value18}</output><C19 input19={value18} /></div>
}

function C17({ input17 }) @{
	const value17 = computed(() => counted(17, input17));
	<div class='c' data-level='17'><output data-value='17'>{value17}</output><C18 input18={value17} /></div>
}

function C16({ input16 }) @{
	const value16 = computed(() => counted(16, input16));
	<div class='c' data-level='16'><output data-value='16'>{value16}</output><C17 input17={value16} /></div>
}

function C15({ input15 }) @{
	const value15 = computed(() => counted(15, input15));
	<div class='c' data-level='15'><output data-value='15'>{value15}</output><C16 input16={value15} /></div>
}

function C14({ input14 }) @{
	const value14 = computed(() => counted(14, input14));
	<div class='c' data-level='14'><output data-value='14'>{value14}</output><C15 input15={value14} /></div>
}

function C13({ input13 }) @{
	const value13 = computed(() => counted(13, input13));
	<div class='c' data-level='13'><output data-value='13'>{value13}</output><C14 input14={value13} /></div>
}

function C12({ input12 }) @{
	const value12 = computed(() => counted(12, input12));
	<div class='c' data-level='12'><output data-value='12'>{value12}</output><C13 input13={value12} /></div>
}

export default function C11({ input11 }) @{
	let owner11 = state(0);
	const value11 = computed(() => counted(11, input11 + owner11));
	<div class='c' data-level='11'><output data-value='11'>{value11}</output><button type='button' data-owner='11' onClick={() => owner11++}>write 11</button><C12 input12={value11} /></div>
}

