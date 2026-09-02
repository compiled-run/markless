import { state } from '@markless/core';
import { accordion } from '../../index.ts';

// The docs-site shape: a consumer with a <style> of its own writes a DYNAMIC
// class on a family part - a ternary over a `@for` row, a ternary and a
// template over a page cell - and on a plain element beside them. Its own
// scoped rule must reach every element it named, before and after the cell moves.
export default function DynamicClass() @{
	const page = state({ danger: false });
	const groups = state([
		{ value: 'alpha', danger: true },
		{ value: 'beta', danger: false },
	]);

	<section data-testid="frame">
		<style>
			.group { border: 2px solid rgb(0, 128, 0); }
			.group.is-danger { border-color: rgb(200, 0, 0); }
		</style>
		<p class={page.danger ? 'group is-danger' : 'group'} data-testid="host">Host</p>
		<accordion.root data-testid="root">
			<accordion.item value="fixed" class="group" data-testid="fixed-item">
				<accordion.itemlabel>
					<accordion.itemtrigger data-testid="fixed-trigger">Fixed</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent>A static class.</accordion.itemcontent>
			</accordion.item>
			<accordion.item
				value="ternary"
				class={page.danger ? 'group is-danger' : 'group'}
				data-testid="ternary-item"
			>
				<accordion.itemlabel>
					<accordion.itemtrigger data-testid="ternary-trigger">Ternary</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent>A ternary over a page cell.</accordion.itemcontent>
			</accordion.item>
			<accordion.item
				value="template"
				class={`group ${page.danger ? 'is-danger' : 'is-calm'}`}
				data-testid="template-item"
			>
				<accordion.itemlabel>
					<accordion.itemtrigger data-testid="template-trigger">Template</accordion.itemtrigger>
				</accordion.itemlabel>
				<accordion.itemcontent>A template over a page cell.</accordion.itemcontent>
			</accordion.item>
			<div role="presentation" data-testid="rows">
				@for (const group of groups; key group.value) {
					<accordion.item
						value={group.value}
						class={group.danger ? 'group is-danger' : 'group'}
						data-testid="row-item"
					>
						<accordion.itemlabel>
							<accordion.itemtrigger data-testid="row-trigger">{group.value}</accordion.itemtrigger>
						</accordion.itemlabel>
						<accordion.itemcontent>A ternary over a row.</accordion.itemcontent>
					</accordion.item>
				}
			</div>
		</accordion.root>
		<button
			type="button"
			data-testid="toggle-danger"
			onClick={() => {
				page.danger = !page.danger;
			}}
		>Toggle danger</button>
	</section>
}
