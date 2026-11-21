Thank you. The same component also exists in a second version, which differs only in the name of the share feature. Here are the two lines that differ in each version. Answer from this message and the earlier one alone; do not use any tools.

Version KD:
```tsrx
import { location, network, notifications, settings, share } from '@markless/device';
<button onClick={() => share.open({ title, url })}>Share</button>
```

Version PY:
```tsrx
import { location, network, notifications, settings, sharesheet } from '@markless/device';
<button onClick={() => sharesheet.open({ title, url })}>Share</button>
```

Questions:
A. Which name reads clearer next to Markless's `shared` from `@markless/core`, and why?
B. Could either name be mistaken for `shared`, or for something else? Which, and how?

Output format: lines `A:` and `B:`; end with `Tools used: none`.
