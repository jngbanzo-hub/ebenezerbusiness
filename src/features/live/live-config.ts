import { companyConfig } from "@/config/company";

export type LiveScheduleItem = {
  date: string;
  time: string;
  title: string;
  description: string;
};

export const liveMediaConfig = {
  youtube: {
    platform: "YouTube",
    channelName: companyConfig.socialMedia.youtubeName,
    channelUrl: companyConfig.socialMedia.youtubeUrl,
    liveUrl: ""
  },
  tiktok: {
    platform: "TikTok",
    channelName: companyConfig.socialMedia.tiktokName,
    profileUrl: companyConfig.socialMedia.tiktokUrl
  },
  upcomingStreams: [
    {
      date: "À annoncer",
      time: "À confirmer",
      title: "Prochain direct officiel",
      description:
        `Le programme sera mis à jour dès qu’un direct ${companyConfig.name} sera confirmé.`
    },
    {
      date: "À annoncer",
      time: "À confirmer",
      title: "Communication opérationnelle",
      description:
        "Annonces, informations agences et communications importantes seront publiées ici."
    }
  ] satisfies LiveScheduleItem[]
} as const;

export function getYouTubeEmbedUrl(liveUrl: string) {
  if (!liveUrl) {
    return "";
  }

  try {
    const url = new URL(liveUrl);
    const videoId = url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).pop();

    return videoId ? `https://www.youtube.com/embed/${videoId}` : liveUrl;
  } catch {
    return liveUrl;
  }
}
