// Runs before paint: sets data-theme on <html> from the saved preference or the
// OS setting, so the page never flashes the wrong theme. Rendered first in <body>.
export function ThemeScript() {
  const js = `(function(){try{var t=localStorage.getItem('pi-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
