import { chromium } from '@playwright/test';
import { fragmentNavigationSuite } from '../support/fragment-navigation-suite.ts';

fragmentNavigationSuite('chromium', chromium);
