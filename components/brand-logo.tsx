import Image from "next/image";
import { brand } from "@/lib/brand";

/**
 * The original MISRCONSULT logo asset (public/brand/misrconsult-logo.png),
 * sourced unchanged from the official site. Never redrawn or recolored.
 * The alt text is supplied by the caller from the active locale's
 * dictionary (brand.logoAlt).
 */
export function BrandLogo({
  className = "h-12 w-auto",
  alt,
}: {
  className?: string;
  alt: string;
}) {
  return (
    <Image
      src={brand.logoSrc}
      alt={alt}
      width={brand.logoWidth}
      height={brand.logoHeight}
      className={className}
      priority
    />
  );
}
