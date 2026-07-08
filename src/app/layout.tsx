import type { Metadata, Viewport } from "next";

import "@/app/globals.css";

import { PwaRegister } from "@/components/pwa-register";
import { companyInfo } from "@/config/company";
import { SiteTicker } from "@/features/home/site-ticker";
import { defaultSeoDescription } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(companyInfo.website),
  applicationName: companyInfo.name,
  title: {
    default: companyInfo.name,
    template: `%s | ${companyInfo.name}`
  },
  description: defaultSeoDescription,
  keywords: [
    "Eben Ezer Business",
    "fret Bénin RDC",
    "transport colis Bénin Congo",
    "expédition Cotonou Kinshasa",
    "logistique RDC",
    "suivi colis"
  ],
  authors: [{ name: companyInfo.name }],
  creator: companyInfo.name,
  publisher: companyInfo.name,
  category: "Logistique",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", sizes: "32x32", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: {
    capable: true,
    title: "EEB",
    statusBarStyle: "black-translucent"
  },
  formatDetection: {
    telephone: false
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": "EEB"
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#061225" },
    { media: "(prefers-color-scheme: light)", color: "#A3E635" }
  ],
  colorScheme: "dark"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className="pb-12 sm:pb-14">
        <PwaRegister />
        {children}
        <SiteTicker />
      </body>
    </html>
  );
}
