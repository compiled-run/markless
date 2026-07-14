import { createServerEntry } from '@markless/router/vite/runtime/create-server-entry';
import { resumeEntryPath } from 'virtual:markless-router/resume-entry-path';
import { navigationEntryPath } from 'virtual:markless-router/navigation-entry-path';
import {
	routeModulePreloads,
	routeSsrModulePreloads,
	routeStylesheets,
} from 'virtual:markless-router/route-preloads';
import { pageModuleLoaders, routeFileIds } from 'virtual:markless-router/routes';

const documentModuleLoaders = import.meta.glob(['/document.tsrx']);
const entry = createServerEntry({
	resumeEntryPath,
	navigationEntryPath,
	routeModulePreloads,
	routeSsrModulePreloads,
	routeStylesheets,
	documentModuleLoader: documentModuleLoaders['/document.tsrx'],
	pageModuleLoaders,
	routeFileIds,
});

export const fetch = entry.fetch;
export default entry;
