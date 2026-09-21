import { lucide } from '@markless/ui';

export default function PlatformIcon({ platform }: { readonly platform: string }) @{
 <span class="platform-icon" data-icon-platform={platform} aria-hidden="true">
  <svg class="apple-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.05 12.54c.03 3.19 2.8 4.25 2.83 4.27-.02.07-.44 1.52-1.46 3.02-.89 1.3-1.81 2.6-3.27 2.63-1.43.03-1.89-.85-3.52-.85-1.63 0-2.14.82-3.49.88-1.4.05-2.46-1.41-3.36-2.7-1.83-2.66-3.23-7.53-1.35-10.82.94-1.63 2.61-2.66 4.42-2.69 1.38-.03 2.68.93 3.52.93.84 0 2.43-1.15 4.1-.98.7.03 2.66.28 3.92 2.12-.1.06-2.35 1.37-2.33 4.19ZM14.37 4.46c.75-.91 1.26-2.17 1.12-3.43-1.08.04-2.39.72-3.17 1.63-.7.8-1.32 2.09-1.15 3.32 1.21.1 2.44-.62 3.2-1.52Z" /></svg>
  <svg class="windows-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M2 3h9v8H2zm11 0h9v8h-9zM2 13h9v8H2zm11 0h9v8h-9z" /></svg>
  <span class="linux-icon"><lucide.terminal width="18" height="18" /></span>
  <span class="auto-icon"><lucide.monitor width="18" height="18" /></span>
  <style>
   .platform-icon { display: inline-flex; flex: none; width: 18px; height: 18px; align-items: center; justify-content: center; }
   .platform-icon > * { display: none; }
   .platform-icon[data-icon-platform='mac'] .apple-icon,
   .platform-icon[data-icon-platform='windows'] .windows-icon,
   .platform-icon[data-icon-platform='linux'] .linux-icon,
   .platform-icon[data-icon-platform='auto'] .auto-icon { display: block; }
  </style>
 </span>;
}
