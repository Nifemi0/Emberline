# Extractable components

The current frontend is monolithic HTML rather than imported component source. No component should be registered as a Superdesign DraftComponent before the landing-page design because conversion would invent an API that does not exist in the codebase.

Potential components to extract during implementation:

## PublicNav
- Source: new landing page markup, not yet created
- Category: layout
- Description: Brand, section navigation, deployment-status indicator, and workspace CTA
- Extractable props: activeItem, workspaceHref
- Hardcoded: brand symbol, labels, colors, typography

## WorkspacePreview
- Source: representative patterns in `app/index.html`
- Category: basic
- Description: Product walkthrough preview using milestone, evidence, quorum, and release states
- Extractable props: activeStep
- Hardcoded: sample project labels, iconography, visual structure

## RoleGuide
- Source: representative actor roles in `app/index.html` and `app/app.js`
- Category: basic
- Description: Explains what owners, implementers, and independent reviewers do
- Extractable props: selectedRole
- Hardcoded: role names and core permissions
