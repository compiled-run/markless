```tsrx
import { Share } from '@markless/device';

export default function ShareArticle({ title, url }: { title: string; url: string }) @{
	<button onClick={() => Share.share({ title, url })}>Share</button>
}
```
