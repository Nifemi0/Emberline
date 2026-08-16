# Theme

## Compact token summary

- Ink: `#15201b`
- Muted text: `#74827a`
- Border: `#dce4dc`
- Paper/background: `#f3f5f0`
- White surfaces: `#ffffff`
- Deep brand: `#17231e`
- Deep secondary: `#20342b`
- Brand orange: `#eb7547`
- Success green: `#267258`
- Amber: `#a86519`
- Error/dispute: `#a34d3b`
- Premium display font: Instrument Sans, 500–700
- Body/interface font: Manrope, 400–800
- Technical/meta font: DM Mono, 400–500
- Main shadow: `0 22px 60px rgba(25,45,34,.09)`
- Primary radii: 8px controls, 13–16px panels, 20px feature surfaces, pill badges
- Breakpoints: 1080px, 760px, 430px

## Raw source

Source: `app/styles.css`

```css
:root {
  --ink:#15201b; --muted:#74827a; --line:#dce4dc; --paper:#f3f5f0; --white:#fff;
  --deep:#17231e; --deep-2:#20342b; --orange:#eb7547; --green:#267258; --amber:#a86519; --red:#a34d3b;
  --mono:"DM Mono",monospace; --sans:Manrope,system-ui,sans-serif; --shadow:0 22px 60px rgba(25,45,34,.09);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans)}
```

The full stylesheet is `app/styles.css` (24 minified lines, 13.5 KB) and is always passed directly to Superdesign because it is under the 900-line trimming threshold.
