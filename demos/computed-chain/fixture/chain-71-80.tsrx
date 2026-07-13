import { computed } from '@markless/core';
import { counted } from './counted.ts';
import C81 from './chain-81-90.tsrx';

function C80({ input80, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value80 = computed(() => counted(80, input80));
	<div class='c' data-level='80'><output data-value='80'>{value80}</output><C81 input81={value80} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C79({ input79, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value79 = computed(() => counted(79, input79));
	<div class='c' data-level='79'><output data-value='79'>{value79}</output><C80 input80={value79} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C78({ input78, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value78 = computed(() => counted(78, input78));
	<div class='c' data-level='78'><output data-value='78'>{value78}</output><C79 input79={value78} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C77({ input77, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value77 = computed(() => counted(77, input77));
	<div class='c' data-level='77'><output data-value='77'>{value77}</output><C78 input78={value77} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C76({ input76, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value76 = computed(() => counted(76, input76));
	<div class='c' data-level='76'><output data-value='76'>{value76}</output><C77 input77={value76} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C75({ input75, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value75 = computed(() => counted(75, input75));
	<div class='c' data-level='75'><output data-value='75'>{value75}</output><C76 input76={value75} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C74({ input74, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value74 = computed(() => counted(74, input74));
	<div class='c' data-level='74'><output data-value='74'>{value74}</output><C75 input75={value74} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C73({ input73, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value73 = computed(() => counted(73, input73));
	<div class='c' data-level='73'><output data-value='73'>{value73}</output><C74 input74={value73} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C72({ input72, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value72 = computed(() => counted(72, input72));
	<div class='c' data-level='72'><output data-value='72'>{value72}</output><C73 input73={value72} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

export default function C71({ input71, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value71 = computed(() => counted(71, input71 + owner71));
	<div class='c' data-level='71'><output data-value='71'>{value71}</output><C72 input72={value71} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

