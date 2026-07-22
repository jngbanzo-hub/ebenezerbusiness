import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/seo";

const routes = [
  { path: "/", priority: 1 },
  { path: "/services", priority: 0.86 },
  { path: "/tarifs", priority: 0.9 },
  { path: "/suivi-de-colis", priority: 0.94 },
  { path: "/contact", priority: 0.88 },
  { path: "/privacy", priority: 0.5 },
  { path: "/live", priority: 0.62 }
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return routes.map((route) => ({
    url: new URL(route.path, siteUrl).toString(),
    lastModified,
    changeFrequency: "weekly",
    priority: route.priority
  }));
}
