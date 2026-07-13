import { computed } from '@markless/core';
import { counted } from './counted.ts';
import C31 from './chain-31-40.tsrx';

function C30({ input30, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value30 = computed(() => counted(30, input30));
	<div class='c' data-level='30'><output data-value='30'>{value30}</output><C31 input31={value30} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C29({ input29, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value29 = computed(() => counted(29, input29));
	<div class='c' data-level='29'><output data-value='29'>{value29}</output><C30 input30={value29} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C28({ input28, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value28 = computed(() => counted(28, input28));
	<div class='c' data-level='28'><output data-value='28'>{value28}</output><C29 input29={value28} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C27({ input27, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value27 = computed(() => counted(27, input27));
	<div class='c' data-level='27'><output data-value='27'>{value27}</output><C28 input28={value27} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C26({ input26, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value26 = computed(() => counted(26, input26));
	<div class='c' data-level='26'><output data-value='26'>{value26}</output><C27 input27={value26} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C25({ input25, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value25 = computed(() => counted(25, input25));
	<div class='c' data-level='25'><output data-value='25'>{value25}</output><C26 input26={value25} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C24({ input24, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value24 = computed(() => counted(24, input24));
	<div class='c' data-level='24'><output data-value='24'>{value24}</output><C25 input25={value24} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C23({ input23, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value23 = computed(() => counted(23, input23));
	<div class='c' data-level='23'><output data-value='23'>{value23}</output><C24 input24={value23} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C22({ input22, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value22 = computed(() => counted(22, input22));
	<div class='c' data-level='22'><output data-value='22'>{value22}</output><C23 input23={value22} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

export default function C21({ input21, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value21 = computed(() => counted(21, input21 + owner21));
	<div class='c' data-level='21'><output data-value='21'>{value21}</output><C22 input22={value21} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

