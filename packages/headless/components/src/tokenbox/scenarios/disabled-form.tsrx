import { state } from '@markless/core';
import { tokenbox } from '../../index.ts';

// A disabled box inside a real form. A disabled control is barred from submission
// by the platform, so the hidden input the field part renders has to carry the
// flag too.
export default function DisabledForm() @{
	let submitted = state('unsubmitted');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = String(new FormData(event.target as HTMLFormElement).get('prompt') ?? 'absent');
		}}
	>
		<tokenbox.root
			disabled
			name="prompt"
			data-testid="root"
			triggers={['@']}
			defaultValue={[
				{ kind: 'text', text: 'hi ' },
				{ kind: 'token', value: 'u_1', label: 'Alice Chen' },
			]}
		>
			<tokenbox.label data-testid="label">Prompt</tokenbox.label>
			<tokenbox.input data-testid="input" />
			<tokenbox.field data-testid="field" />
		</tokenbox.root>
		<button type="submit" data-testid="submit">Send</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
