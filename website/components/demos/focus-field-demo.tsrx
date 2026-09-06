import FocusField from './focus-field.tsrx';

// The playground frame, and the one class the site's stylesheet needs to dress
// the pieces inside it. The teaching file carries no site classes at all.
export default function FocusFieldDemo() @{
	<div class="playground playground-echo">
		<FocusField />
	</div>
}
