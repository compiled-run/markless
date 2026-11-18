// Module: @markless/device (excerpt)
// Which build this is, fixed when the app is built. In the website build it is 'web' whatever device the visitor uses.
// Platform differences in a page are checks of this value: `@if (platform === 'ios') { … }`.
export declare const platform: 'ios' | 'android' | 'web';
