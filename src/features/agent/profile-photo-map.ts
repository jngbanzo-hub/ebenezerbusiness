const PROFILE_PHOTOS_BY_AGENT_ID: Readonly<Record<string, string>> = {
  "5c0bb1b1-56f2-40df-bb93-1a2ba43b4eb3": "/agents/fih-profile.jpg",
  "ac8d449e-4461-4fd3-a15f-910ad66299db": "/agents/coo-kiss-profile.jpg",
};

export function getAgentProfilePhoto(agentId: string): string | null {
  return PROFILE_PHOTOS_BY_AGENT_ID[agentId.trim().toLowerCase()] ?? null;
}
