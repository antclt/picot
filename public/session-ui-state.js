// ABOUTME: Coordinates host-backed per-session model/thinking profiles.
// ABOUTME: Profiles never use browser storage.

function normalizeProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  const provider = typeof profile.provider === "string" ? profile.provider.trim() : "";
  const modelId = typeof profile.modelId === "string" ? profile.modelId.trim() : "";
  const thinkingLevel = typeof profile.thinkingLevel === "string" ? profile.thinkingLevel : "off";
  if (!provider || !modelId) return null;
  return { provider, modelId, thinkingLevel };
}

export class SessionUiStateStore {
  constructor({ profileClient = null, waitUntilReady = null } = {}) {
    this.profileClient = profileClient;
    this.waitUntilReady = waitUntilReady;
  }

  async loadProfile() {
    if (!this.profileClient?.load) return null;
    try {
      await this.waitUntilReady?.();
      return normalizeProfile(await this.profileClient.load());
    } catch {
      return null;
    }
  }

  async saveProfile(profile) {
    const normalized = normalizeProfile(profile);
    if (!normalized || !this.profileClient?.save) return null;
    try {
      await this.waitUntilReady?.();
      return normalizeProfile(await this.profileClient.save(normalized)) || normalized;
    } catch {
      return null;
    }
  }
}
