# Shared layouts

## Application shell

Source: `app/index.html`

The existing workspace uses a fixed 244px dark sidebar and a fluid main dashboard. The sidebar contains the Emberline brand, section anchors, project switcher, live Attestcoin status, and actor identity. The main area contains the project header, actions, hero/capital summary, metrics, milestone ledger, review network, activity, and footer.

```html
<div class="app-shell">
  <aside class="sidebar">
    <a class="brand" href="#"><span class="brand-symbol">✦</span><span>emberline</span></a>
    <div class="side-label">WORKSPACE</div>
    <nav>
      <a class="active" href="#overview"><span>⌂</span> Overview</a>
      <a href="#milestones"><span>◇</span> Milestones</a>
      <a href="#reviewers"><span>◉</span> Review network</a>
      <a href="#activity"><span>↗</span> Audit trail</a>
    </nav>
    <div class="side-label project-label">PROJECT WORKSPACES</div>
    <div class="project-list" id="projectList"><div class="sidebar-loading">Loading workspaces…</div></div>
    <div class="sidebar-foot">
      <div class="chain-card"><i></i><span><small>ATTESTCOIN PROTOCOL</small><strong id="chainStatus">Adapter unconfigured</strong></span></div>
      <button class="identity-card" id="identityButton"><span class="identity-avatar">SK</span><span><strong id="identityName">Read-only visitor</strong><small id="identityRole">Connect an actor</small></span><b>•••</b></button>
    </div>
  </aside>
  <main class="main" id="overview">
    <header class="topbar">
      <div><div class="breadcrumb">EMBERLINE / PROJECT ACCOUNTABILITY</div><h1>Capital should move at the speed of verified work.</h1></div>
      <div class="top-actions"><span class="live-status"><i></i> PERSISTENT DATA</span><button class="secondary">＋ Commit capital</button><button class="secondary">＋ New project</button><button class="primary">Connect actor</button></div>
    </header>
    <section class="project-hero">Project identity and capital progress</section>
    <section class="metric-grid">Four project metrics</section>
    <section class="workspace-grid">Milestone ledger, independent review, and activity</section>
    <footer><span>EMBERLINE / VERIFIED MILESTONE INFRASTRUCTURE</span><span>Evidence informs people. Policy controls capital.</span></footer>
  </main>
</div>
```

Responsive behavior from `app/styles.css`:

- Under 1080px the sidebar narrows and the workspace stacks.
- Under 760px the sidebar becomes a compact top section and major grids become single-column.
- Under 430px metrics and primary actions become stacked/two-column mobile controls.

There is no existing public landing layout. The requested landing page is a new target and should hand off to this existing workspace without altering its operational information architecture.
