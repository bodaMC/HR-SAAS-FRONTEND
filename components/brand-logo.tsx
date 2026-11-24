import Image from "next/image";
import { brand } from "@/lib/brand";

/**
 * The original MISRCONSULT logo asset (public/brand/misrconsult-logo.png),
 * sourced unchanged from the official site. Never redrawn or recolored.
 */
export function BrandLogo({ className = "h-12 w-auto" }: { className?: string }) {
  return (
    <Image
      src={brand.logoSrc}
      alt={brand.logoAlt}
      width={783}
      height={556}
      className={className}
      priority
    />
  );
}
