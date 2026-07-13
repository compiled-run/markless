import { computed, state } from '@markless/core';
import { counted } from './counted.ts';
import C51 from './chain-51-60.tsrx';

function C50({ input50 }) @{
	const value50 = computed(() => counted(50, input50));
	<div class='c' data-level='50'><output data-value='50'>{value50}</output><C51 input51={value50} /></div>
}

function C49({ input49 }) @{
	const value49 = computed(() => counted(49, input49));
	<div class='c' data-level='49'><output data-value='49'>{value49}</output><C50 input50={value49} /></div>
}

function C48({ input48 }) @{
	const value48 = computed(() => counted(48, input48));
	<div class='c' data-level='48'><output data-value='48'>{value48}</output><C49 input49={value48} /></div>
}

function C47({ input47 }) @{
	const value47 = computed(() => counted(47, input47));
	<div class='c' data-level='47'><output data-value='47'>{value47}</output><C48 input48={value47} /></div>
}

function C46({ input46 }) @{
	const value46 = computed(() => counted(46, input46));
	<div class='c' data-level='46'><output data-value='46'>{value46}</output><C47 input47={value46} /></div>
}

function C45({ input45 }) @{
	const value45 = computed(() => counted(45, input45));
	<div class='c' data-level='45'><output data-value='45'>{value45}</output><C46 input46={value45} /></div>
}

function C44({ input44 }) @{
	const value44 = computed(() => counted(44, input44));
	<div class='c' data-level='44'><output data-value='44'>{value44}</output><C45 input45={value44} /></div>
}

function C43({ input43 }) @{
	const value43 = computed(() => counted(43, input43));
	<div class='c' data-level='43'><output data-value='43'>{value43}</output><C44 input44={value43} /></div>
}

function C42({ input42 }) @{
	const value42 = computed(() => counted(42, input42));
	<div class='c' data-level='42'><output data-value='42'>{value42}</output><C43 input43={value42} /></div>
}

export default function C41({ input41 }) @{
	let owner41 = state(0);
	const value41 = computed(() => counted(41, input41 + owner41));
	<div class='c' data-level='41'><output data-value='41'>{value41}</output><button type='button' data-owner='41' onClick={() => owner41++}>write 41</button><C42 input42={value41} /></div>
}

