import { computed, state } from '@markless/core';
import C91 from './chain-91-100.tsrx';

function counted(level, value) { globalThis.__signalEvaluationCounts[level]++; return value; }

function C90({ input90 }) @{
	const value90 = computed(() => counted(90, input90));
	<div class='c' data-level='90'><output data-value='90'>{value90}</output><C91 input91={value90} /></div>
}

function C89({ input89 }) @{
	const value89 = computed(() => counted(89, input89));
	<div class='c' data-level='89'><output data-value='89'>{value89}</output><C90 input90={value89} /></div>
}

function C88({ input88 }) @{
	const value88 = computed(() => counted(88, input88));
	<div class='c' data-level='88'><output data-value='88'>{value88}</output><C89 input89={value88} /></div>
}

function C87({ input87 }) @{
	const value87 = computed(() => counted(87, input87));
	<div class='c' data-level='87'><output data-value='87'>{value87}</output><C88 input88={value87} /></div>
}

function C86({ input86 }) @{
	const value86 = computed(() => counted(86, input86));
	<div class='c' data-level='86'><output data-value='86'>{value86}</output><C87 input87={value86} /></div>
}

function C85({ input85 }) @{
	const value85 = computed(() => counted(85, input85));
	<div class='c' data-level='85'><output data-value='85'>{value85}</output><C86 input86={value85} /></div>
}

function C84({ input84 }) @{
	const value84 = computed(() => counted(84, input84));
	<div class='c' data-level='84'><output data-value='84'>{value84}</output><C85 input85={value84} /></div>
}

function C83({ input83 }) @{
	const value83 = computed(() => counted(83, input83));
	<div class='c' data-level='83'><output data-value='83'>{value83}</output><C84 input84={value83} /></div>
}

function C82({ input82 }) @{
	const value82 = computed(() => counted(82, input82));
	<div class='c' data-level='82'><output data-value='82'>{value82}</output><C83 input83={value82} /></div>
}

export default function C81({ input81 }) @{
	let owner81 = state(0);
	const value81 = computed(() => counted(81, input81 + owner81));
	<div class='c' data-level='81'><output data-value='81'>{value81}</output><button type='button' data-owner='81' onClick={() => owner81++}>write 81</button><C82 input82={value81} /></div>
}

