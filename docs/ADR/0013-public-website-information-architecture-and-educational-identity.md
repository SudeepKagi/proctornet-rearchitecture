# ADR-0013: Public Website Information Architecture, Educational Identity Presentation, and Static Asset Delivery

## Status
Accepted

## Date
2026-09-09

## Context & Problem Statement
Prior to Phase 30, ProctorNet existed purely as an internal application without a dedicated public presentation layer. The root URL (`/`) redirected unauthenticated visitors directly to `/login`. Evaluators, recruiters, academic supervisors, and prospective users had no discoverable entry point to understand what the platform is, inspect its modular monolith architecture, review privacy and data policies, or understand its ethical proctoring boundaries.

Furthermore, remote examination software projects frequently succumb to commercial marketing distortions—claiming turnkey SaaS readiness, 99.9% cheat detection precision, or displaying fabricated testimonials and university endorsements.

ProctorNet requires an authoritative public presentation architecture that:
1. Clearly and unapologetically presents ProctorNet as a student-built academic software engineering capstone project.
2. Discloses the full modular monolith architecture and operational realities transparently without commercial exaggeration.
3. Provides an accessible, responsive, and search-engine-discoverable public experience across 22+ dedicated routes without modifying the underlying database schema.
4. Delivers high-resolution SVG architecture diagrams while isolating private operational portals and candidate workspaces.
5. Adheres to the **Final Content Rule**: Presents all features using direct, domain-oriented capability descriptions rather than historical development phase numbers.

---

## Decision Drivers
- **Non-Negotiable Academic Identity**: The platform must present itself as a student-built engineering demonstration. Commercial SaaS claims, pricing tiers, sales demo booking, and fabricated logos/testimonials are strictly prohibited.
- **Zero Database Migrations (`DATABASE MIGRATION: NOT PLANNED`)**: Public contact forms, project updates, and academic feedback must function via stateless client-side logging and audit events without mutating database schemas.
- **Route & Security Isolation**: Public informational routes must be strictly segregated from authenticated candidate, faculty, invigilator, admin, and WireGuard-bounded developer portals.
- **Responsive & Accessible Standards**: Strict conformance with WCAG 2.1 AA across desktop, tablet, and mobile viewports (375px to 4K).
- **Direct Capability Terminology**: Historical phase numbers ("Phase 25", "Phase 28", "Phases 0–29", etc.) must not be used as product navigation, feature categories, roadmap items, or documentation structures.

---

## Considered Options

### Option 1: External Static Site (Docusaurus / Next.js / Astro on a Separate Domain)
- Build the public website as a separate static site repository deployed to an external hosting provider (e.g. Vercel, Netlify).
- *Rejected*: Introduces cross-domain cookie and authentication complexity between the informational site and the React SPA (`app.proctornet.edu` vs `proctornet.edu`), duplicates design system CSS tokens, increases deployment maintenance overhead, and splits the codebase.

### Option 2: Retain Minimal Splash Page and Direct Everything to `/login`
- Keep `/login` as the main landing page with minimal project bullet points in the sidebar.
- *Rejected*: Inadequate for comprehensive academic evaluation. Leaves no space for detailed system design walkthroughs, ethical AI disclosures, data flow mapping, or accessibility statements.

### Option 3: Unified Single-Page Application (SPA) Public Tree with Layout Boundaries (Selected)
- Implement a comprehensive public route tree directly within the existing React 19 SPA under a dedicated `<PublicLayout>` wrapper:
  - Preserves unified design system CSS custom properties across public and private views.
  - Mounts 22+ public routes (`/`, `/about`, `/features`, `/how-it-works`, `/for-students`, `/for-faculty`, `/for-institutions`, `/ai-proctoring`, `/security`, `/accessibility`, `/architecture`, `/documentation`, `/faq`, `/contact`, `/project-interest`, `/project-feedback`, `/thank-you`, `/terms`, `/privacy`, `/cookies`, `/acceptable-use`, `/academic-integrity`, `/ai-proctoring-notice`, `/accessibility-statement`, and public `*` 404).
  - Routes authenticated users to `/dashboard` which executes role-based redirection to their specific operational workspace.

---

## Decision Outcome
**Chosen Option**: Option 3.

### Architectural Invariants & Implementation Details:

1. **Routing Topology & Layout Boundary**:
   - Public informational routes are wrapped in `<PublicLayout>`, which injects a WCAG-compliant skip-to-content link, `PublicNavbar`, `CookieConsentBanner`, and `PublicFooter`.
   - The Root URL (`/`) serves the public `LandingPage.jsx`. Authenticated users are provided with a prominent "Go to Dashboard" button in the navbar routing to `/dashboard` (`RootRedirect.jsx`).
   - Private examination, grading, and monitoring portals retain their existing `<ProtectedRoute>` and `<RoleRoute>` guards.

2. **Vector Diagram Standards**:
   - All architectural topologies, screen proctoring pipelines, exam lifecycles, and security perimeters are authored as responsive, high-resolution SVG vector diagrams (`frontend/src/assets/diagrams/`).
   - Pure SVGs are used instead of client-rendered Mermaid.js or ASCII diagrams to ensure deterministic rendering, crisp zoom scaling, and zero third-party script vulnerabilities.

3. **Content Authenticity Governance**:
   - Every quantitative assertion is classified explicitly:
     - `[MEASURED]`: Empirically validated in testing or benchmarks (e.g. `[MEASURED] 0 answer loss during broker disconnection chaos test`).
     - `[ESTIMATED]`: Derived from architectural bounds.
     - `[TARGET]`: Calibrated design goal (e.g. `[TARGET] < 2000ms autosave cycle`).
   - Fabricated university crests, customer logos, and invented testimonials are strictly prohibited. The `/project-feedback` page displays only verified academic supervisor and peer testing notes.

4. **Direct Capability Naming**:
   - All public-facing copy describes capabilities directly: "Client-side screen analysis" (not Phase 28), "Pre-exam biometric identity verification" (not Phase 25), "Real-time invigilator console" (not Phase 26), and "Developer operations telemetry portal" (not Phase 27).

---

## Consequences
- **Positive**:
  - Unified single-repository codebase; zero multi-site deployment synchronization overhead.
  - Instantaneous client-side page transitions across public routes with sub-100ms response times.
  - Full SEO discoverability with dynamic meta tags, sitemap.xml, and robots.txt.
  - Honest, authentic academic positioning that protects project integrity during capstone evaluations.
- **Negative / Trade-offs**:
  - Requires dynamic head management in the client browser (`usePageMeta` hook) since server-side rendering (SSR) is not implemented.
  - Slightly larger frontend bundle size (mitigated by code splitting and SVG asset optimization).
