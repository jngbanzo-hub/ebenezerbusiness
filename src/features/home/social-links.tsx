import { companySocialMedia } from "@/config/company";

export const officialSocialLinks = [
  {
    label: "YouTube",
    name: companySocialMedia.youtubeName,
    href: companySocialMedia.youtubeUrl,
    icon: YouTubeIcon
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

export function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#FF0000"
        d="M21.58 7.19a2.73 2.73 0 0 0-1.92-1.93C17.96 4.8 12 4.8 12 4.8s-5.96 0-7.66.46a2.73 2.73 0 0 0-1.92 1.93C1.96 8.9 1.96 12 1.96 12s0 3.1.46 4.81a2.73 2.73 0 0 0 1.92 1.93c1.7.46 7.66.46 7.66.46s5.96 0 7.66-.46a2.73 2.73 0 0 0 1.92-1.93c.46-1.71.46-4.81.46-4.81s0-3.1-.46-4.81Z"
      />
      <path fill="#FFFFFF" d="M9.85 15.29V8.71L15.5 12l-5.65 3.29Z" />
    </svg>
  );
}

export function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 4v10.75A3.25 3.25 0 1 1 12 11.76V7.5l7-1.5v3l-5 1.08"
        stroke="#25F4EE"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.15"
        transform="translate(-.7 -.25)"
      />
      <path
        d="M14 4v10.75A3.25 3.25 0 1 1 12 11.76V7.5l7-1.5v3l-5 1.08"
        stroke="#FE2C55"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.15"
        transform="translate(.7 .25)"
      />
      <path
        d="M14 4v10.75A3.25 3.25 0 1 1 12 11.76V7.5l7-1.5v3l-5 1.08"
        stroke="#050505"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.15"
      />
    </svg>
  );
}
