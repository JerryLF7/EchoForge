import fs from "node:fs";
import path from "node:path";

import { assertValidAgainstSchema } from "../schema/validator.js";

const defaultProfile = {
  id: "general",
  label: "General audio intelligence",
  promptProfile: "general",
  outputPreset: "default",
  language: "auto",
  audioUnderstanding: {
    capabilities: {
      speakerInference: true,
      timestampAlignment: true,
      terminologyCorrection: true,
    },
    prompt: "Understand the audio.",
    terminologyHints: [],
  },
  sections: ["summary", "chapters", "decisions", "quotes", "links"],
  todosEnabled: false,
};

export function loadProfile(repoRoot, profileName) {
  const profilePath = path.join(repoRoot, "profiles", `${profileName}.json`);

  if (!fs.existsSync(profilePath)) {
    const profile = {
      ...defaultProfile,
      id: profileName,
      audioUnderstanding: {
        ...defaultProfile.audioUnderstanding,
      },
    };
    assertValidAgainstSchema(repoRoot, "profile.schema.json", profile, `profile ${profileName}`);
    return profile;
  }

  const raw = fs.readFileSync(profilePath, "utf8");
  const profile = JSON.parse(raw);
  assertValidAgainstSchema(repoRoot, "profile.schema.json", profile, `profile ${profileName}`);
  return profile;
}
