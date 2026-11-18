import { webkit } from '@playwright/test';
import { fragmentNavigationSuite } from '../support/fragment-navigation-suite.ts';

fragmentNavigationSuite('webkit', webkit);
