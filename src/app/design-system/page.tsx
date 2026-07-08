import { DesignSystemDemo } from "@/app/design-system/design-system-demo";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Design System",
  description: "Démonstration interne du design system Eben Ezer Business.",
  path: "/design-system",
  noIndex: true
});

export default function DesignSystemPage() {
  return <DesignSystemDemo />;
}
