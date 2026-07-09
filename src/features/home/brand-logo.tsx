import Image from "next/image";

import { companyInfo } from "@/config/company";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  animateArrow?: boolean;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  surface?: "none" | "dark" | "light";
};

export function BrandLogo({
  animateArrow = false,
  className,
  imageClassName,
  priority = false,
  surface = "none"
}: BrandLogoProps) {
  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden rounded-md",
        surface === "dark" && "bg-ebe-night/85 ring-1 ring-white/10",
        surface === "light" && "bg-white ring-1 ring-black/10",
        className
      )}
    >
      <Image
        src="/brand/eben-ezer-business-logo.png"
        alt={companyInfo.name}
        width={665}
        height={375}
        priority={priority}
        className={cn("h-auto w-full object-contain", imageClassName)}
      />
      {animateArrow ? (
        <span aria-hidden="true" className="brand-logo-arrow-shine">
          <span className="brand-logo-arrow-shine__runner" />
          <span className="brand-logo-arrow-shine__burst" />
        </span>
      ) : null}
    </div>
  );
}
