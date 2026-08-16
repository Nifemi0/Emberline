# Routes

Emberline uses a custom Node HTTP server and a framework-free frontend.

| URL | Source | Layout | Purpose |
| --- | --- | --- | --- |
| `/` | `app/landing.html` | Public product guide | Premium explanation, workflow, roles, trust model, and live deployment |
| `/workspace` | `app/index.html` | Fixed sidebar workspace | Operational project accountability dashboard |
| `/health` | `server.mjs` | JSON | Deployment and Attestcoin integration readiness |
| `/api/*` | `server.mjs` | JSON | Authenticated application data and mutations |

The public-to-product flow is:

1. `/` presents product explanation, trust model, workflow, role guidance, and live deployment status.
2. “Enter workspace” links to `/workspace`.
3. The workspace retains its section anchors: `#overview`, `#milestones`, `#reviewers`, and `#activity`.
