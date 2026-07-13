import { computed } from '@markless/core';
import { counted } from './counted.ts';

function C100({ input100, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value100 = computed(() => counted(100, input100));
	<div class='c' data-level='100'><output data-value='100'>{value100}</output></div>
}

function C99({ input99, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value99 = computed(() => counted(99, input99));
	<div class='c' data-level='99'><output data-value='99'>{value99}</output><C100 input100={value99} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C98({ input98, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value98 = computed(() => counted(98, input98));
	<div class='c' data-level='98'><output data-value='98'>{value98}</output><C99 input99={value98} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C97({ input97, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value97 = computed(() => counted(97, input97));
	<div class='c' data-level='97'><output data-value='97'>{value97}</output><C98 input98={value97} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C96({ input96, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value96 = computed(() => counted(96, input96));
	<div class='c' data-level='96'><output data-value='96'>{value96}</output><C97 input97={value96} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C95({ input95, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value95 = computed(() => counted(95, input95));
	<div class='c' data-level='95'><output data-value='95'>{value95}</output><C96 input96={value95} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C94({ input94, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value94 = computed(() => counted(94, input94));
	<div class='c' data-level='94'><output data-value='94'>{value94}</output><C95 input95={value94} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C93({ input93, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value93 = computed(() => counted(93, input93));
	<div class='c' data-level='93'><output data-value='93'>{value93}</output><C94 input94={value93} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C92({ input92, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value92 = computed(() => counted(92, input92));
	<div class='c' data-level='92'><output data-value='92'>{value92}</output><C93 input93={value92} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

export default function C91({ input91, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value91 = computed(() => counted(91, input91 + owner91));
	<div class='c' data-level='91'><output data-value='91'>{value91}</output><C92 input92={value91} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

