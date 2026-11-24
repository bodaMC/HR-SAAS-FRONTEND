/**
 * Central product and company identity.
 *
 * CONURE HR (كونور) is the product; MISRCONSULT (مصر كونسلت) is the company
 * operating it. The two identities are deliberately separate: the product
 * name can change without touching the company identity, and vice versa.
 *
 * Per the Phase 2.1 rebrand decision, the product carries NO textual slogan:
 * no tagline or service description is rendered anywhere (pages, components
 * or metadata). Identity display is limited to the product name, the company
 * name and the logo.
 *
 * Localized display strings (product/company names per locale) live in the
 * i18n dictionaries under the `brand.*` keys; this module holds only
 * locale-independent assets and the reference palette.
 *
 * Branding is presentational only: it must never determine tenant identity,
 * authentication or authorization. Tenant data always comes from the
 * backend API. Environment variable names, the session cookie name and
 * existing localStorage keys are unchanged for backward compatibility.
 */
export interface BrandConfig {
  /** Stable brand identifier, used for scoping only. */
  id: string;
  /** Original MISRCONSULT logo asset; never redrawn or recolored. */
  logoSrc: string;
  /** Intrinsic logo dimensions for stable layout. */
  logoWidth: number;
  logoHeight: number;
  /** Reference palette; the active values live in CSS variables in globals.css. */
  colors: {
    primary: string;
    accent: string;
    secondary: string;
    supporting: string;
    supportingAlt: string;
    forest: string;
  };
}

export const brand: BrandConfig = {
  id: "misrconsult",
  logoSrc: "/brand/misrconsult-logo.png",
  logoWidth: 783,
  logoHeight: 556,
  colors: {
    primary: "#146010",
    accent: "#7CD424",
    secondary: "#267226",
    supporting: "#5EB726",
    supportingAlt: "#5BB52B",
    forest: "#10382A",
  },
};
