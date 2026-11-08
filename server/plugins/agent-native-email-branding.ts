import { defineAppConfig } from "@agent-native/core/server";

export default defineAppConfig({
  app: {
    // This name appears in transactional emails. Change it to your product name.
    name: "Superacharya",
    // The source template keeps a renamed app from inheriting first-party email branding.
    sourceTemplate: "app",
    // Authenticated entry after sign-in (not the Agent-Native chat template).
    homePath: "/whiteboard",
    // Optional: use your own absolute HTTPS logo URL in transactional emails.
    // logoUrl: "https://example.com/logo.png",
  },
});
