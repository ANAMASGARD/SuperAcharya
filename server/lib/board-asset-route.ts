import { isActionContractError } from "@agent-native/core/action";
import { getSession, runWithRequestContext } from "@agent-native/core/server";
import { createError, type H3Event } from "h3";
export async function withBoardAssetSession<T>(
  event: H3Event,
  run: (owner: string) => Promise<T>,
): Promise<T> {
  const session = await getSession(event);
  if (!session?.email)
    throw createError({
      statusCode: 401,
      message: "Sign in to access drawing images.",
    });
  if (event.req.method !== "GET") {
    const origin = event.req.headers.get("origin");
    if (!origin || origin !== new URL(event.req.url).origin)
      throw createError({ statusCode: 403, message: "Invalid upload origin." });
  }
  try {
    return await runWithRequestContext(
      {
        userEmail: session.email,
        ...(session.authUserId ? { authUserId: session.authUserId } : {}),
        orgScope: "personal",
      },
      () => run(session.email.toLowerCase()),
    );
  } catch (error) {
    if (isActionContractError(error))
      throw createError({
        statusCode: error.statusCode,
        message: error.message,
      });
    throw error;
  }
}
