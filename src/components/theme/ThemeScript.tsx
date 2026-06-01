/**
 * No-flash theme initializer. Rendered as the first child of <body> so it runs
 * before the page paints — reads the persisted theme and sets the `theme-*`
 * class on <html> ahead of React hydration (pages are SSR/ISR, must not flash).
 */
export function ThemeScript() {
  const js = `(function(){try{var t=localStorage.getItem('tubechat-theme')||'dark';var e=document.documentElement;e.classList.remove('theme-dark','theme-light');e.classList.add('theme-'+(t==='light'?'light':'dark'));}catch(_){document.documentElement.classList.add('theme-dark');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} suppressHydrationWarning />;
}
