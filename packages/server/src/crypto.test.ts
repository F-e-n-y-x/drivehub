import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto.js";

describe("token encryption", () => {
  const key = "a-strong-test-secret-key-1234567890";

  it("round-trips a refresh token", () => {
    const token = "1//0gabc.DEF-refresh-token_value";
    const enc = encryptSecret(token, key);
    expect(enc).not.toContain(token);
    expect(decryptSecret(enc, key)).toBe(token);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same", key);
    const b = encryptSecret("same", key);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe("same");
    expect(decryptSecret(b, key)).toBe("same");
  });

  it("fails to decrypt with the wrong key", () => {
    const enc = encryptSecret("secret", key);
    expect(() => decryptSecret(enc, "wrong-key-entirely-000000000000")).toThrow();
  });
});
