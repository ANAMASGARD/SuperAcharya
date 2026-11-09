export const TEACHER_WELCOME_TEXT = "Hello बेटा! आज आप क्या पढ़ना चाहते हैं?";
export const TEACHER_WELCOME_PROMPT = "The student has just opened the classroom. Give one short warm spoken greeting and ask what they want to study today. Use the saved spoken language preference. If their class and subject are already known, do not ask them again. Otherwise ask briefly for the missing class or subject. Use everyday Hindi/Hinglish by default, such as Hello बेटा, आज आप क्या पढ़ना चाहते हैं? मुझे subject या topic बताइए, या अपना question पूछिए. Always use आप and respectful verb forms, never तुम/तू or चाहते हो. Keep the greeting to two short sentences. Do not solve old board work, recap the conversation, or add a long introduction.";

/** One identity per classroom visit; duplicate effects reuse it and normal admission excludes overlapping tabs. */
export async function welcomeRequestId(boardId: string, visitId: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`teacher-welcome:${boardId}:${visitId}`),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 21);
}
