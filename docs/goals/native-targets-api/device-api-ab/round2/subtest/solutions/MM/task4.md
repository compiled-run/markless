```tsrx
// file: task4/ShareButton.tsrx
import { sharing } from '@markless/device';

export default function ShareButton({ title, url }: { title: string; url: string }) @{
	const sheet = sharing();

	<button onClick={() => sheet.share({ title, url })}>Share</button>
}
```
