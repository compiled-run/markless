import { state } from '@markless/core';

export default function SelectValuePage() @{
	let size = state('m');
	let color = state('Blue');
	let crust = state('thin');
	let open = state(true);
	const crusts = state([
		{ id: 'thick', label: 'Thick' },
		{ id: 'thin', label: 'Thin' },
		{ id: 'stuffed', label: 'Stuffed' },
	]);
	const colors = state(['Red', 'Green', 'Blue']);

	<form>
		<select data-size value={size} onChange={(event) => (size = event.currentTarget.value)}>
			<option value="s">Small</option>
			<optgroup label="Big">
				<option value="m">Medium</option>
				<option value="l">Large</option>
			</optgroup>
		</select>
		<select data-crust value={crust}>
			@for (const option of crusts; key option.id) {
				<option value={option.id}>{option.label}</option>
			}
		</select>
		<select data-color value={color}>
			@for (const name of colors; key name) {
				<option>{name}</option>
			}
		</select>
		<select data-plain value={size}>
			<option>  s </option>
			<option>m</option>
		</select>
		<select data-fixed value="two">
			<option value="one">One</option>
			<option value="two">Two</option>
		</select>
		@if (open) {
			<select data-arm value={size}>
				<option value="s">Small</option>
				<option value="m">Medium</option>
			</select>
		}
		<output data-echo>{size}</output>
		<button data-large type="button" onClick={() => (size = 'l')}>large</button>
		<button data-stuffed type="button" onClick={() => (crust = 'stuffed')}>stuffed</button>
		<button data-toggle type="button" onClick={() => (open = !open)}>toggle</button>
	</form>
}
