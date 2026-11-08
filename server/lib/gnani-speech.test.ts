import { resolveSecretDetailed } from "@agent-native/core/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { encodeWav } from "../../app/lib/speech/capture";
import { validateSpeechWav, MAX_SPEECH_BYTES } from "../../shared/speech";
import { gnaniKey, transcribeWithGnani } from "./gnani-speech";
vi.mock("@agent-native/core/server", () => ({
  resolveSecretDetailed: vi.fn(),
}));
const audio = async () =>
  new Uint8Array(await encodeWav(new Float32Array(48000), 48000).arrayBuffer());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Gnani speech adapter", () => {
  it("encodes and validates resampled mono PCM, rejects malformed/oversize input", async () => {
    const bytes = await audio();
    expect(bytes.length).toBe(32044);
    expect(() => validateSpeechWav(bytes)).not.toThrow();
    bytes[20] = 3;
    expect(() => validateSpeechWav(bytes)).toThrow();
    expect(() =>
      validateSpeechWav(new Uint8Array(MAX_SPEECH_BYTES + 2)),
    ).toThrow();
    expect(() => validateSpeechWav(new Uint8Array(0))).toThrow();
  });
  it("uses v3.0, Hindi/English hints and a server-only key", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          success: true,
          transcript: "hello",
          model: "prisma-v3.0",
          detected_language_code: "en-IN",
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const output = await transcribeWithGnani(
      await audio(),
      "test-key",
      new AbortController().signal,
    );
    expect(output.transcript).toBe("hello");
    const options = fetcher.mock.calls[0]![1];
    expect(options.body.get("model")).toBe("prisma-v3.0");
    expect(options.body.get("language_code")).toBe("hi-IN,en-IN");
    expect(options.headers["X-API-Key-ID"]).toBe("test-key");
    expect(JSON.stringify(output)).not.toContain("test-key");
  });
  it("rejects a model mismatch and redacts provider errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            success: true,
            transcript: "hi",
            model: "prisma-v2.5",
          }),
        ),
    );
    await expect(
      transcribeWithGnani(
        await audio(),
        "test-key",
        new AbortController().signal,
      ),
    ).rejects.toThrow("invalid transcription");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ private: "secret" }, { status: 403 }),
        ),
    );
    await expect(
      transcribeWithGnani(
        await audio(),
        "test-key",
        new AbortController().signal,
      ),
    ).rejects.toThrow("STT permissions");
  });
  it("distinguishes unavailable vault from missing key and supports the requested env fallback", async () => {
    vi.mocked(resolveSecretDetailed).mockResolvedValue({
      lookupFailed: true,
      value: null,
    });
    await expect(gnaniKey()).rejects.toThrow("Could not read");
    vi.mocked(resolveSecretDetailed).mockResolvedValue({
      lookupFailed: false,
      value: null,
    });
    await expect(gnaniKey()).rejects.toThrow("Settings");
    vi.mocked(resolveSecretDetailed).mockResolvedValue({
      lookupFailed: false,
      value: "key",
      source: "env",
    });
    await expect(gnaniKey()).resolves.toBe("key");
    vi.mocked(resolveSecretDetailed).mockResolvedValue({
      lookupFailed: false,
      value: null,
    });
    vi.stubEnv("GNANI_API_KEY", "deployment-key");
    await expect(gnaniKey()).resolves.toBe("deployment-key");
  });
});
