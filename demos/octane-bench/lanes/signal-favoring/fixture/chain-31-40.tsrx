import { computed } from '@markless/core';
import { counted } from './counted.ts';
import C41 from './chain-41-50.tsrx';

function C40({ input40, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value40 = computed(() => counted(40, input40));
	<div class='c' data-level='40'><output data-value='40'>{value40}</output><C41 input41={value40} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C39({ input39, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value39 = computed(() => counted(39, input39));
	<div class='c' data-level='39'><output data-value='39'>{value39}</output><C40 input40={value39} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C38({ input38, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value38 = computed(() => counted(38, input38));
	<div class='c' data-level='38'><output data-value='38'>{value38}</output><C39 input39={value38} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C37({ input37, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value37 = computed(() => counted(37, input37));
	<div class='c' data-level='37'><output data-value='37'>{value37}</output><C38 input38={value37} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C36({ input36, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value36 = computed(() => counted(36, input36));
	<div class='c' data-level='36'><output data-value='36'>{value36}</output><C37 input37={value36} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C35({ input35, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value35 = computed(() => counted(35, input35));
	<div class='c' data-level='35'><output data-value='35'>{value35}</output><C36 input36={value35} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C34({ input34, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value34 = computed(() => counted(34, input34));
	<div class='c' data-level='34'><output data-value='34'>{value34}</output><C35 input35={value34} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C33({ input33, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value33 = computed(() => counted(33, input33));
	<div class='c' data-level='33'><output data-value='33'>{value33}</output><C34 input34={value33} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C32({ input32, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value32 = computed(() => counted(32, input32));
	<div class='c' data-level='32'><output data-value='32'>{value32}</output><C33 input33={value32} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

export default function C31({ input31, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value31 = computed(() => counted(31, input31 + owner31));
	<div class='c' data-level='31'><output data-value='31'>{value31}</output><C32 input32={value31} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

