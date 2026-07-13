import { computed } from '@markless/core';
import { counted } from './counted.ts';
import C61 from './chain-61-70.tsrx';

function C60({ input60, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value60 = computed(() => counted(60, input60));
	<div class='c' data-level='60'><output data-value='60'>{value60}</output><C61 input61={value60} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C59({ input59, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value59 = computed(() => counted(59, input59));
	<div class='c' data-level='59'><output data-value='59'>{value59}</output><C60 input60={value59} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C58({ input58, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value58 = computed(() => counted(58, input58));
	<div class='c' data-level='58'><output data-value='58'>{value58}</output><C59 input59={value58} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C57({ input57, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value57 = computed(() => counted(57, input57));
	<div class='c' data-level='57'><output data-value='57'>{value57}</output><C58 input58={value57} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C56({ input56, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value56 = computed(() => counted(56, input56));
	<div class='c' data-level='56'><output data-value='56'>{value56}</output><C57 input57={value56} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C55({ input55, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value55 = computed(() => counted(55, input55));
	<div class='c' data-level='55'><output data-value='55'>{value55}</output><C56 input56={value55} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C54({ input54, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value54 = computed(() => counted(54, input54));
	<div class='c' data-level='54'><output data-value='54'>{value54}</output><C55 input55={value54} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C53({ input53, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value53 = computed(() => counted(53, input53));
	<div class='c' data-level='53'><output data-value='53'>{value53}</output><C54 input54={value53} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C52({ input52, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value52 = computed(() => counted(52, input52));
	<div class='c' data-level='52'><output data-value='52'>{value52}</output><C53 input53={value52} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

export default function C51({ input51, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value51 = computed(() => counted(51, input51 + owner51));
	<div class='c' data-level='51'><output data-value='51'>{value51}</output><C52 input52={value51} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

