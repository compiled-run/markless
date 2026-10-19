import { computed, state } from '@markless/core';
import { makeUsers, toggle, viewRows } from './table.ts';
import { UserRow } from './user-row.tsrx';

// 16 fixed row slots, one component edge each: the shape a table with a fixed page size compiles to.
export default function Slots16() @{
	const users = makeUsers(16);
	let selected = state<string[]>([]);
	const rows = computed(() => viewRows(users, selected));

	<main>
		<table>
			<tbody>
				<UserRow
					rows={rows}
					slot={0}
					onToggle={() => {
						selected = toggle(selected, users[0]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={1}
					onToggle={() => {
						selected = toggle(selected, users[1]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={2}
					onToggle={() => {
						selected = toggle(selected, users[2]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={3}
					onToggle={() => {
						selected = toggle(selected, users[3]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={4}
					onToggle={() => {
						selected = toggle(selected, users[4]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={5}
					onToggle={() => {
						selected = toggle(selected, users[5]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={6}
					onToggle={() => {
						selected = toggle(selected, users[6]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={7}
					onToggle={() => {
						selected = toggle(selected, users[7]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={8}
					onToggle={() => {
						selected = toggle(selected, users[8]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={9}
					onToggle={() => {
						selected = toggle(selected, users[9]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={10}
					onToggle={() => {
						selected = toggle(selected, users[10]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={11}
					onToggle={() => {
						selected = toggle(selected, users[11]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={12}
					onToggle={() => {
						selected = toggle(selected, users[12]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={13}
					onToggle={() => {
						selected = toggle(selected, users[13]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={14}
					onToggle={() => {
						selected = toggle(selected, users[14]?.id);
					}}
				/>
				<UserRow
					rows={rows}
					slot={15}
					onToggle={() => {
						selected = toggle(selected, users[15]?.id);
					}}
				/>
			</tbody>
		</table>
		<output>{selected.length}</output>
	</main>;
}
