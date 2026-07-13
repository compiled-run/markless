import { computed, state } from '@markless/core';
import C71 from './chain-71-80.tsrx';

function counted(level, value) { globalThis.__signalEvaluationCounts[level]++; return value; }

function C70({ input70 }) @{
	const value70 = computed(() => counted(70, input70));
	<div class='c' data-level='70'><output data-value='70'>{value70}</output><C71 input71={value70} /></div>
}

function C69({ input69 }) @{
	const value69 = computed(() => counted(69, input69));
	<div class='c' data-level='69'><output data-value='69'>{value69}</output><C70 input70={value69} /></div>
}

function C68({ input68 }) @{
	const value68 = computed(() => counted(68, input68));
	<div class='c' data-level='68'><output data-value='68'>{value68}</output><C69 input69={value68} /></div>
}

function C67({ input67 }) @{
	const value67 = computed(() => counted(67, input67));
	<div class='c' data-level='67'><output data-value='67'>{value67}</output><C68 input68={value67} /></div>
}

function C66({ input66 }) @{
	const value66 = computed(() => counted(66, input66));
	<div class='c' data-level='66'><output data-value='66'>{value66}</output><C67 input67={value66} /></div>
}

function C65({ input65 }) @{
	const value65 = computed(() => counted(65, input65));
	<div class='c' data-level='65'><output data-value='65'>{value65}</output><C66 input66={value65} /></div>
}

function C64({ input64 }) @{
	const value64 = computed(() => counted(64, input64));
	<div class='c' data-level='64'><output data-value='64'>{value64}</output><C65 input65={value64} /></div>
}

function C63({ input63 }) @{
	const value63 = computed(() => counted(63, input63));
	<div class='c' data-level='63'><output data-value='63'>{value63}</output><C64 input64={value63} /></div>
}

function C62({ input62 }) @{
	const value62 = computed(() => counted(62, input62));
	<div class='c' data-level='62'><output data-value='62'>{value62}</output><C63 input63={value62} /></div>
}

export default function C61({ input61 }) @{
	let owner61 = state(0);
	const value61 = computed(() => counted(61, input61 + owner61));
	<div class='c' data-level='61'><output data-value='61'>{value61}</output><button type='button' data-owner='61' onClick={() => owner61++}>write 61</button><C62 input62={value61} /></div>
}

