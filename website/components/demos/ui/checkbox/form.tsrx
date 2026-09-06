import { checkbox } from '@markless/ui';
import Preview from '../../../ui/preview.tsrx';

export default function CheckboxForm({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<style>
			.demo-button {
				align-self: flex-start;
				font-size: var(--step-0);
				padding: 0.3em 0.9em;
				color: var(--on-accent);
				background: var(--green-soft);
				border: 2px solid var(--ink);
				border-radius: 2px;
				box-shadow: 3px 3px 0 var(--ink);
				cursor: pointer;
			}

			.demo-button:active {
				transform: translate(3px, 3px);
				box-shadow: none;
			}
		</style>
		<form style="display:grid; gap:0.8em; width:min(30rem,100%);">
			<checkbox.root required name="newsletter" value="weekly" style="display:flex; gap:0.7em; align-items:center;">
				<checkbox.field />
				<checkbox.trigger style="flex:none; display:grid; place-items:center; width:1.5em; height:1.5em; padding:0; border:2px solid var(--code-edge); border-radius:4px; background:var(--paper); color:var(--ink); font:inherit; line-height:1; cursor:pointer;">
					<checkbox.indicator>✓</checkbox.indicator>
				</checkbox.trigger>
				<checkbox.label style="cursor:pointer;">Send me the weekly digest</checkbox.label>
			</checkbox.root>
			<button type="submit" class="demo-button">Save</button>
		</form>
	</Preview>
}
