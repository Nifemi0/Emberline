# Shared UI components

Emberline is a framework-free, single-page application. It has no separate shared component directory or imported UI library. Reusable visual primitives are expressed as CSS classes in `app/styles.css` and instantiated directly in `app/index.html`.

## Buttons

Source: `app/index.html`, `app/styles.css`

```html
<button class="primary">Connect actor</button>
<button class="secondary">＋ Commit capital</button>
<button class="ghost-light">Inspect evidence trail ↗</button>
<button class="text-button">Refresh</button>
```

```css
.primary,.secondary,.ghost-light,.release-button{border:0;border-radius:8px;padding:11px 14px;font-size:11px;font-weight:700}
.primary{background:var(--orange);color:#fff}
.primary:hover{background:#df6538}
.secondary{background:#fff;border:1px solid var(--line);color:#405047}
.ghost-light{background:transparent;color:#d7e2dc;border:1px solid #40574c;width:100%}
.text-button{border:0;background:none;color:#d7653c;font-size:9px;padding:0}
```

## Panel

Source: `app/index.html`, `app/styles.css`

```html
<div class="panel">
  <div class="panel-head">
    <div><span class="eyebrow">SECTION LABEL</span><h3>Panel title</h3></div>
  </div>
</div>
```

```css
.panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:23px}
.panel-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px}
.panel-head .eyebrow{color:#829088}
.panel-head h3{font-size:18px;letter-spacing:-.045em;margin:7px 0 0}
```

## Status badges

```html
<span class="state-pill">IN REVIEW</span>
<span class="hash-badge">AUDIT HASH CHAIN</span>
<span class="quorum-badge">1 / 2</span>
```

```css
.state-pill{border:1px solid #657c70;color:#f0b291;border-radius:99px;padding:7px 9px}
.hash-badge,.quorum-badge{font:8px var(--mono);letter-spacing:.06em;padding:7px 8px;border-radius:7px}
.hash-badge{background:#f1f4f1;color:#7b8a81}
.quorum-badge{background:#fff0e6;color:#ad5c30}
```
