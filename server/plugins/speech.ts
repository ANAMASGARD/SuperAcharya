import { registerRequiredSecret } from "@agent-native/core/secrets";
registerRequiredSecret({
  key: "GNANI_API_KEY",
  label: "Gnani API key",
  description:
    "Transcribes whiteboard microphone clips with Prisma v3.0. Requires STT access.",
  docsUrl: "https://docs.gnani.ai/api/STT/stt-rest",
  scope: "user",
  kind: "api-key",
  required: false,
});
export default () => {};
