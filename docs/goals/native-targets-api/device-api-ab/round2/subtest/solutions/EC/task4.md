```tsrx
// file: task4/ShareButton.tsrx
import { share } from '@markless/device';

export default function ShareButton({ title, url }: { title: string; url: string }) @{
	<button onClick={() => share({ title, url })}>Share</button>
}
```
