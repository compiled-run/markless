```tsrx
import { shareSheet } from '@markless/device';

export default function ShareArticle({ title, url }: { title: string; url: string }) @{
	const sheet = shareSheet();

	<button onClick={() => sheet.open({ title, url })}>Share</button>
}
```
