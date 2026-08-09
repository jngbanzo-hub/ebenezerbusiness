import assert from "node:assert/strict";
import test from "node:test";

import { getAgentProfilePhoto } from "./profile-photo-map";

test("associe uniquement Sera NGBANZO à la photo FIH", () => {
  assert.equal(
    getAgentProfilePhoto("5c0bb1b1-56f2-40df-bb93-1a2ba43b4eb3"),
    "/agents/fih-profile.jpg",
  );
});

test("conserve le fallback initiales pour les autres Agents", () => {
  assert.equal(getAgentProfilePhoto("7be74430-9bd7-41d5-ab22-8f9c5f1ab7bb"), null);
  assert.equal(getAgentProfilePhoto("agent-inconnu"), null);
  assert.equal(getAgentProfilePhoto(""), null);
});
