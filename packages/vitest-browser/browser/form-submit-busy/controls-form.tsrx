import { addItem } from '../mutations-refresh/server.ts';

export function ControlsForm() @{
	<section>
		<form
			id="order"
			data-form
			onSubmit={async (event) => {
				event.preventDefault();
				const data = new FormData(event.currentTarget as HTMLFormElement);
				await addItem([data.getAll('size').join('+'), data.get('wrap'), data.get('note')].join('|'));
			}}
		>
			<select name="size" multiple data-size>
				<option value="s" selected>S</option>
				<option value="m">M</option>
			</select>
			<input type="radio" name="wrap" value="box" checked data-box />
			<input type="radio" name="wrap" value="bag" data-bag />
			<button type="submit" data-submit>Order</button>
		</form>
		<input form="order" name="note" value="none" data-note />
	</section>
}
