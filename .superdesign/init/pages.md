# Page dependency trees

## `/` — Public landing page

Entry: `app/landing.html`

Dependencies:

- `app/landing.html`
  - `app/landing.css`
  - `app/landing.js`
    - browser Fetch API → `/health`

## `/workspace` — Operational workspace

Entry: `app/index.html`

Dependencies:

- `app/index.html`
  - `app/styles.css`
  - `app/app.js`
    - browser Fetch API → `/health`
    - browser Fetch API → `/api/session`
    - browser Fetch API → `/api/projects`
    - browser Fetch API → `/api/projects/:id`
    - browser Fetch API → milestone/review/release mutation endpoints

The document includes the sidebar/application shell, project dashboard, milestone/reviewer/activity panels, five action modals, toast notifications, and actor-session controls. No local UI modules are imported because the frontend is framework-free.
