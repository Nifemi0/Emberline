# Emberline design system

## Product context

Emberline is an attestation-gated milestone funding platform. It helps owners commit capital, implementers submit private evidence commitments, independent reviewers approve or dispute a revision, and policy release funds only when quorum and sequence conditions are satisfied. The public landing page must make this model understandable before a visitor enters the dense operational workspace.

## Audience and jobs to be done

- Funders and project owners need to understand what controls capital and why it is trustworthy.
- Implementers need to see how private files become commitments without being uploaded.
- Reviewers need to understand independence, revision binding, approval, and dispute behavior.
- Technical evaluators need visible proof that the live app uses Sepolia, Attestcoin/USC, and Creditcoin testnet contracts.
- First-time visitors need a clear, low-friction path into read-only exploration or an actor session.

## Information architecture

The landing page is a premium, explanatory front door with:

1. Sticky public navigation: Product, How it works, Roles, Trust, and Enter workspace.
2. Hero: precise promise, one-sentence explanation, primary workspace CTA, secondary “See the workflow” CTA, live network readiness.
3. Product proof: a polished visual walkthrough showing evidence → independent review → quorum → release.
4. Four-step workflow with plain language and progressive disclosure.
5. Role-based navigation guide for owner, implementer, reviewer, and read-only visitor.
6. Trust architecture explaining private local hashing, immutable revisions, Attestcoin verification, and hash-chained audit history without jargon overload.
7. Live deployment strip with Sepolia registry, Creditcoin verifier, escrow, and health state.
8. Final CTA and compact footer with repository/explorer links.

## Visual direction

Preserve and elevate the existing Emberline identity. The mood is institutional confidence with editorial clarity: dark forest-green feature surfaces, warm paper backgrounds, restrained orange action color, generous whitespace, crisp grids, and technical mono labels. It should feel top-tier and bespoke, not like a generic crypto landing template. Avoid neon, purple, glassmorphism, excessive gradients, floating coins, or blockchain clichés.

## Tokens

- Colors: `#15201b` ink, `#74827a` muted, `#dce4dc` border, `#f3f5f0` paper, `#ffffff` surface, `#17231e` deep, `#20342b` deep secondary, `#eb7547` primary orange, `#267258` success, `#a86519` amber, `#a34d3b` dispute.
- Typography: Instrument Sans for display headings and high-impact navigation; Manrope for body/interface copy; DM Mono for labels, hashes, statuses, and network metadata. Instrument Sans provides the premium editorial character while Manrope keeps dense product copy highly readable.
- Type: hero 64–76px desktop with tight tracking; section headings 40–52px; body 16–19px with 1.6 line-height; meta labels 10–12px uppercase mono.
- Spacing: 4/8/12/16/24/32/48/64/96/128 rhythm.
- Radius: 8px controls, 16px cards, 24–32px major feature surfaces, pills for state.
- Shadows: sparse and deep; use `0 22px 60px rgba(25,45,34,.09)` for featured floating surfaces only.
- Borders: 1px `#dce4dc`; dark borders use `rgba(255,255,255,.12)`.

## Components

- Navigation: compact brand left, editorial links center/right, live green status, orange workspace CTA.
- Buttons: orange primary; white/dark outlined secondary; 44–48px height; 8–10px radius; unmistakable focus states.
- Cards: clear hierarchy, restrained borders, meaningful status color, no decorative clutter.
- Workflow: visual connector line with numbered states and an adjacent realistic product preview.
- Role guide: segmented tabs/cards that reveal role-specific “What you do / What you can verify / Where to start.”
- Network proof: mono addresses truncated visually but accessible in full via links/tooltips.

## Motion and interaction

- Smooth anchor navigation and subtle section reveal (respect `prefers-reduced-motion`).
- Product walkthrough advances by click and keyboard; never auto-rotate critical explanatory content.
- Hover states translate at most 2px and strengthen border/shadow.
- The workspace CTA remains visible in the sticky nav on desktop and mobile.

## Accessibility and responsiveness

- WCAG AA contrast, visible keyboard focus, semantic headings, descriptive CTA labels, 44px touch targets.
- Desktop max content width 1240–1320px.
- Tablet stacks workflow copy above preview.
- Mobile uses a compact navigation, 36–44px hero type, single-column cards, horizontally scrollable deployment metadata only when unavoidable.

## Hard constraints

Use ONLY Instrument Sans, Manrope, and DM Mono. Use Instrument Sans deliberately for display typography—not small operational copy. Use ONLY the existing Emberline palette and derived transparent variants. Preserve the brand symbol `✦` and lowercase `emberline` wordmark. Do not introduce unrelated fonts, colors, gradients, or visual styles. The landing page must link clearly into the existing operational workspace rather than replacing its functionality.
