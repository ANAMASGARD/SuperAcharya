import { resolveSecretDetailed } from "@agent-native/core/server";
import { z } from "zod";

export type TeacherProviderKey =
  | "OPENAI_API_KEY"
  | "CLOCKED_API_KEY"
  | "SARVAM_API_KEY";
export async function teacherCredential(key: TeacherProviderKey) {
  const scoped = await resolveSecretDetailed(key);
  if (scoped.lookupFailed)
    throw new Error("Credential storage is unavailable. Please retry.");
  // guard:allow-env-credential — User explicitly approved server-only teacher deployment keys; scoped Settings keys win.
  return scoped.value || process.env[key]?.trim() || null;
}
export const teacherSettings = () =>
  z
    .object({
      model: z.string().min(1),
      speaker: z.string().min(1),
      pace: z.coerce.number().min(0.5).max(2),
    })
    .parse({
      // guard:allow-env-credential — Deployment model identifier, not a credential or user-scoped secret.
      model: process.env.TEACHER_OPENAI_MODEL || "gpt-6-luna",
      // guard:allow-env-credential — Deployment voice identifier, not a credential or user-scoped secret.
      speaker: process.env.SARVAM_TTS_SPEAKER || "kalpit_en_edtech",
      // guard:allow-env-credential — Non-secret deployment speech speed, bounded to the model's supported range.
      pace: process.env.SARVAM_TTS_PACE || "1.25",
    });
