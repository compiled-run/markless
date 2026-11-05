import { UserPageSplit } from './user-page-split-body.tsrx';

// The page from the async direction note with the posts heading inside the posts block: a server render gates
// a block on one async value, and this outer block reads only the user.
export default function SplitPage() @{
	<UserPageSplit params={{ id: 'ada' }} />
}
