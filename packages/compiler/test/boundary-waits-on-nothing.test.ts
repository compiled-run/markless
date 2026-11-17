import { ASYNC_BOUNDARY_ARM } from '@markless/serializer/protocol';
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function servedArm(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	return result.protocolView.asyncBoundaries[0]!.initiallyServedArm;
}

test('a @try that reads no async value is served settled', async () => {
	expect(
		await servedArm(`
import { state } from '@markless/core';
export function Page() @{
	let open = state(false);
	<main>@try {
		<div>
			@if (open) {
				<p>shown</p>
			}
		</div>
	} @pending {
		<p hidden></p>
	}</main>
}`),
	).toBe(ASYNC_BOUNDARY_ARM.try);
});

test('a @try whose only async work is a handler that can fail is served settled', async () => {
	expect(
		await servedArm(`
import { state } from '@markless/core';
async function save(): Promise<void> {}
export function Page() @{
	let note = state('Idle');
	<main>@try {
		<section>
			<span>{note}</span>
			<button onClick={async () => { note = 'Saving'; await save(); }}>Save</button>
		</section>
	} @catch (error, reset) {
		<>
			<em>{error.message}</em>
			<button onClick={reset}>Dismiss</button>
		</>
	}</main>
}`),
	).toBe(ASYNC_BOUNDARY_ARM.try);
});

test('a @try that reads an async value is served pending, whatever its @catch reads', async () => {
	expect(
		await servedArm(`
import { computed } from '@markless/core';
export function Page() @{
	const report = computed(async () => ({ days: 3 }));
	<main>@try {
		<p>{report.days} days</p>
	} @catch (error) {
		<em>{error.message}</em>
	}</main>
}`),
	).toBe(ASYNC_BOUNDARY_ARM.pending);
});

test('a @try that reads an async value only through a child prop is served pending', async () => {
	expect(
		await servedArm(`
import { computed } from '@markless/core';
function Days(props: { count: number }) @{
	<b>{props.count}</b>
}
export function Page() @{
	const days = computed(async () => 3);
	<main>@try {
		<section><Days count={days} /></section>
	} @pending {
		<p>Loading</p>
	}</main>
}`),
	).toBe(ASYNC_BOUNDARY_ARM.pending);
});
