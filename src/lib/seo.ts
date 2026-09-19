import type { Metadata } from "next";

import { companyInfo } from "@/config/company";

export const siteUrl = companyInfo.website;

export const defaultSeoDescription =
  "Eben Ezer Business organise le transport de colis entre le Bénin et la République Démocratique du Congo avec sécurité, rapidité et professionnalisme.";

const defaultSeoImage = {
  url: "/brand/eben-ezer-business-logo.png",
  width: 665,
  height: 375,
  alt: companyInfo.name
};

type PageMetadataOptions = {
  title: string;
  description: string;
  path?: string;
  absoluteTitle?: boolean;
  noIndex?: boolean;
};

export function createPageMetadata({
  title,
  description,
  path = "/",
  absoluteTitle = false,
  noIndex = false
}: PageMetadataOptions): Metadata {
  const resolvedTitle = absoluteTitle ? title : `${title} | ${companyInfo.name}`;

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: path
    },
    openGraph: {
      title: resolvedTitle,
      description,
      url: path,
      siteName: companyInfo.name,
      locale: "fr_FR",
      type: "website",
      images: [defaultSeoImage]
    },
    twitter: {
      card: "summary_large_image",
      title: resolvedTitle,
      description,
      images: [defaultSeoImage.url]
    },
    robots: noIndex
      ? {
          index: false,
          follow: false
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1
          }
        }
  };
}
