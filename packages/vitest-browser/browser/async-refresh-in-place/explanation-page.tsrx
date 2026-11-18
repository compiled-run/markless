import { UserPage } from './explanation-page-body.tsrx';

// The page from the async explanation note, unchanged.
export default function ExplanationPage() @{
	<UserPage params={{ id: 'ada' }} />
}
