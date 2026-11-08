import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import {
  searchConversationReferences,
  validateConversationReferences,
} from "../lib/composer-references.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "get-teacher-session",
  "update-teacher-context",
  "navigate",
  "hello",
  "provider-api-request",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "superacharya",
  mentionProviders: {
    chats: {
      label: "composerSources.group",
      search: searchConversationReferences,
    },
  },
  prepareRequest: async ({ references, threadId }) => {
    if (threadId?.startsWith("teacher:"))
      throw new Error(
        "Use the classroom teacher runtime for this conversation.",
      );
    await validateConversationReferences(references);
  },
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveActionSurface: ({ availableActionNames }) => ({
    allowedActionNames: availableActionNames.filter(
      (name) =>
        ![
          "start-teacher-turn",
          "enqueue-teaching-step",
          "ack-teaching-step",
        ].includes(name),
    ),
  }),
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the Super Acharya workspace assistant. The classroom teacher runs in its own authenticated LangGraph runtime. Never start or impersonate a classroom teaching turn. Use view-screen for saved board context and get-teacher-session for accepted lesson history. Direct students to Ask Acharya on the whiteboard for live canvas interpretation and writing.

This is a minimal chat-first Agent-Native app. The chat is the product surface, and actions are the contract shared by chat, UI, HTTP, MCP, A2A, and CLI.

Use actions as the source of truth. Start by inspecting the current screen when context matters. When the user asks to extend this app, keep the change small and agent-native: add or update actions, expose useful UI, and keep application state/navigation visible to the agent.`,
});
