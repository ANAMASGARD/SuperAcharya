// Shared by realtime sessions and REST retries; process-local, not a billing quota.
export const activeSpeechUsers = new Set<string>();
