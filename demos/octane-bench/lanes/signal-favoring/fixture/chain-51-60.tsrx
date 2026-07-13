import { computed, state } from '@markless/core';
import { counted } from './counted.ts';
import C61 from './chain-61-70.tsrx';

function C60({ input60 }) @{
	const value60 = computed(() => counted(60, input60));
	<div class='c' data-level='60'><output data-value='60'>{value60}</output><C61 input61={value60} /></div>
}

function C59({ input59 }) @{
	const value59 = computed(() => counted(59, input59));
	<div class='c' data-level='59'><output data-value='59'>{value59}</output><C60 input60={value59} /></div>
}

function C58({ input58 }) @{
	const value58 = computed(() => counted(58, input58));
	<div class='c' data-level='58'><output data-value='58'>{value58}</output><C59 input59={value58} /></div>
}

function C57({ input57 }) @{
	const value57 = computed(() => counted(57, input57));
	<div class='c' data-level='57'><output data-value='57'>{value57}</output><C58 input58={value57} /></div>
}

function C56({ input56 }) @{
	const value56 = computed(() => counted(56, input56));
	<div class='c' data-level='56'><output data-value='56'>{value56}</output><C57 input57={value56} /></div>
}

function C55({ input55 }) @{
	const value55 = computed(() => counted(55, input55));
	<div class='c' data-level='55'><output data-value='55'>{value55}</output><C56 input56={value55} /></div>
}

function C54({ input54 }) @{
	const value54 = computed(() => counted(54, input54));
	<div class='c' data-level='54'><output data-value='54'>{value54}</output><C55 input55={value54} /></div>
}

function C53({ input53 }) @{
	const value53 = computed(() => counted(53, input53));
	<div class='c' data-level='53'><output data-value='53'>{value53}</output><C54 input54={value53} /></div>
}

function C52({ input52 }) @{
	const value52 = computed(() => counted(52, input52));
	<div class='c' data-level='52'><output data-value='52'>{value52}</output><C53 input53={value52} /></div>
}

export default function C51({ input51 }) @{
	let owner51 = state(0);
	const value51 = computed(() => counted(51, input51 + owner51));
	<div class='c' data-level='51'><output data-value='51'>{value51}</output><button type='button' data-owner='51' onClick={() => owner51++}>write 51</button><C52 input52={value51} /></div>
}

