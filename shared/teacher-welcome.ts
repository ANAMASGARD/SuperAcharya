export const TEACHER_WELCOME_TEXT =
  "क्या हाल है बेटा? आप कौन सी क्लास में हैं और आप कौन सी सब्जेक्ट की पढ़ाई करना चाहते हैं?";
export const TEACHER_WELCOME_PROMPT = `Start the lesson by saying exactly this Hindi greeting, with no extra text: ${TEACHER_WELCOME_TEXT}`;

/** Same logical welcome across mounts/tabs; normal turn admission enforces ownership. */
export async function welcomeRequestId(boardId: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`teacher-welcome:${boardId}`),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 21);
}
