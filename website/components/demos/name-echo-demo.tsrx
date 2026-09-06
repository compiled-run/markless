import NameEcho from './name-echo.tsrx';

// The playground frame, and the one class the site's stylesheet needs to dress
// the pieces inside it. The teaching file carries no site classes at all.
export default function NameEchoDemo() @{
	<div class="playground playground-echo">
		<NameEcho />
	</div>
}
