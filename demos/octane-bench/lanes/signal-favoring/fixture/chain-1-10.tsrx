import { computed, state } from '@markless/core';
import C11 from './chain-11-20.tsrx';

function counted(level, value) { globalThis.__signalEvaluationCounts[level]++; return value; }

function C10({ input10 }) @{
	const value10 = computed(() => counted(10, input10));
	<div class='c' data-level='10'><output data-value='10'>{value10}</output><C11 input11={value10} /></div>
}

function C9({ input9 }) @{
	const value9 = computed(() => counted(9, input9));
	<div class='c' data-level='9'><output data-value='9'>{value9}</output><C10 input10={value9} /></div>
}

function C8({ input8 }) @{
	const value8 = computed(() => counted(8, input8));
	<div class='c' data-level='8'><output data-value='8'>{value8}</output><C9 input9={value8} /></div>
}

function C7({ input7 }) @{
	const value7 = computed(() => counted(7, input7));
	<div class='c' data-level='7'><output data-value='7'>{value7}</output><C8 input8={value7} /></div>
}

function C6({ input6 }) @{
	const value6 = computed(() => counted(6, input6));
	<div class='c' data-level='6'><output data-value='6'>{value6}</output><C7 input7={value6} /></div>
}

function C5({ input5 }) @{
	const value5 = computed(() => counted(5, input5));
	<div class='c' data-level='5'><output data-value='5'>{value5}</output><C6 input6={value5} /></div>
}

function C4({ input4 }) @{
	const value4 = computed(() => counted(4, input4));
	<div class='c' data-level='4'><output data-value='4'>{value4}</output><C5 input5={value4} /></div>
}

function C3({ input3 }) @{
	const value3 = computed(() => counted(3, input3));
	<div class='c' data-level='3'><output data-value='3'>{value3}</output><C4 input4={value3} /></div>
}

function C2({ input2 }) @{
	const value2 = computed(() => counted(2, input2));
	<div class='c' data-level='2'><output data-value='2'>{value2}</output><C3 input3={value2} /></div>
}

export default function C1() @{
	let owner1 = state(0);
	const value1 = computed(() => counted(1, owner1));
	<div class='c' data-level='1'><output data-value='1'>{value1}</output><button type='button' data-owner='1' onClick={() => owner1++}>write 1</button><button type='button' data-equal='1' onClick={() => owner1 = owner1}>equal 1</button><C2 input2={value1} /></div>
}

