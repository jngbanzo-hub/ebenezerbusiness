import { Youtube } from "lucide-react";

import { companySocialMedia } from "@/config/company";

export const officialSocialLinks = [
  {
    label: "YouTube",
    name: companySocialMedia.youtubeName,
    href: companySocialMedia.youtubeUrl,
    icon: Youtube
  },
  {
    label: "TikTok",
    name: companySocialMedia.tiktokName,
    href: companySocialMedia.tiktokUrl,
    icon: TikTokIcon
  }
] as const;

export function getSocialHref(href: string) {
  return href || "#";
}

export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 4v10.75A3.25 3.25 0 1 1 12 11.76V7.5l7-1.5v3l-5 1.08"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
