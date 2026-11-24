/**
 * Configurable brand theme.
 *
 * MISRCONSULT is the initial brand for this deployment, expressed as data so a
 * future brand can be introduced without rewriting components. Branding is
 * presentational only: it must never determine tenant identity, authentication
 * or authorization. Tenant data always comes from the backend API.
 */
export interface BrandConfig {
  /** Stable brand identifier, used for scoping only. */
  id: string;
  /** Display name of the deployment's brand owner. */
  companyName: string;
  /** ORBIT remains the product name across brands. */
  productName: string;
  headline: string;
  supportingLine: string;
  footerLine: string;
  logoSrc: string;
  logoAlt: string;
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
  companyName: "MISRCONSULT",
  productName: "ORBIT HR",
  headline: "Engineering a better workplace.",
  supportingLine: "People. Projects. Performance.",
  footerLine: "MISRCONSULT · Powered by ORBIT HR",
  logoSrc: "/brand/misrconsult-logo.png",
  logoAlt: "MISRCONSULT logo",
  colors: {
    primary: "#146010",
    accent: "#7CD424",
    secondary: "#267226",
    supporting: "#5EB726",
    supportingAlt: "#5BB52B",
    forest: "#10382A",
  },
};
