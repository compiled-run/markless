import { state } from '@markless/core';
import { tokenbox } from '../../index.ts';
import type { TokenBoxSegment } from '../tokenbox-types.ts';

// A real form: one hidden input under the root's name carrying the whole value
// as JSON, so a submit handler reads it back with `formData.get(name)` and
// `JSON.parse`. A description and an error ride along, and the error is named
// ahead of the hint.
export default function PromptForm() @{
	let submitted = state('');

	<form
		data-testid="form"
		onSubmit={(event) => {
			event.preventDefault();
			submitted = String(new FormData(event.target as HTMLFormElement).get('prompt') ?? '');
		}}
	>
		<tokenbox.root
			required
			invalid
			name="prompt"
			data-testid="root"
			triggers={['@']}
			defaultValue={[
				{ kind: 'text', text: 'hi ' },
				{ kind: 'token', value: 'u_1', label: 'Alice Chen' },
			]}
			onChange={(next: readonly TokenBoxSegment[]) => {
				void next;
			}}
		>
			<tokenbox.label data-testid="label">Prompt</tokenbox.label>
			<tokenbox.error data-testid="error">Say something first.</tokenbox.error>
			<tokenbox.description data-testid="description">Type {'@'} to mention someone.</tokenbox.description>
			<tokenbox.input data-testid="input" />
			<tokenbox.field data-testid="field" />
		</tokenbox.root>
		<button type="submit" data-testid="submit">Send</button>
		<output data-testid="submitted">{submitted}</output>
	</form>
}
