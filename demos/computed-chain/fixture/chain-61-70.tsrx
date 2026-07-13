import { computed } from '@markless/core';
import { counted } from './counted.ts';
import C71 from './chain-71-80.tsrx';

function C70({ input70, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value70 = computed(() => counted(70, input70));
	<div class='c' data-level='70'><output data-value='70'>{value70}</output><C71 input71={value70} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C69({ input69, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value69 = computed(() => counted(69, input69));
	<div class='c' data-level='69'><output data-value='69'>{value69}</output><C70 input70={value69} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C68({ input68, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value68 = computed(() => counted(68, input68));
	<div class='c' data-level='68'><output data-value='68'>{value68}</output><C69 input69={value68} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C67({ input67, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value67 = computed(() => counted(67, input67));
	<div class='c' data-level='67'><output data-value='67'>{value67}</output><C68 input68={value67} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C66({ input66, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value66 = computed(() => counted(66, input66));
	<div class='c' data-level='66'><output data-value='66'>{value66}</output><C67 input67={value66} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C65({ input65, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value65 = computed(() => counted(65, input65));
	<div class='c' data-level='65'><output data-value='65'>{value65}</output><C66 input66={value65} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C64({ input64, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value64 = computed(() => counted(64, input64));
	<div class='c' data-level='64'><output data-value='64'>{value64}</output><C65 input65={value64} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C63({ input63, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value63 = computed(() => counted(63, input63));
	<div class='c' data-level='63'><output data-value='63'>{value63}</output><C64 input64={value63} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

function C62({ input62, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value62 = computed(() => counted(62, input62));
	<div class='c' data-level='62'><output data-value='62'>{value62}</output><C63 input63={value62} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

export default function C61({ input61, owner1, owner11, owner21, owner31, owner41, owner51, owner61, owner71, owner81, owner91 }) @{
	const value61 = computed(() => counted(61, input61 + owner61));
	<div class='c' data-level='61'><output data-value='61'>{value61}</output><C62 input62={value61} owner1={owner1} owner11={owner11} owner21={owner21} owner31={owner31} owner41={owner41} owner51={owner51} owner61={owner61} owner71={owner71} owner81={owner81} owner91={owner91} /></div>
}

