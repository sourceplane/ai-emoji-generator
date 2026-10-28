import { describe, expect, it } from "vitest";
import {
  signReplicateWebhook,
  timingSafeEqual,
  TOLERANCE_SECONDS,
  verifyReplicateWebhook,
  webhookToken,
} from "@/server/webhook";

// apps/web/src/server/webhook.ts: how a Replicate delivery is accepted.
// Replicate signs the Standard Webhooks way; the vector below is that
// specification's own (standard-webhooks.com), so this is the scheme Replicate
// uses, not one invented here.
const SPEC = {
  secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  timestamp: 1614265330,
  body: '{"test": 2432232314}',
  signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};
const at = (s: number) => s * 1000;
const headers = (sig: string, id = SPEC.id, ts = String(SPEC.timestamp)) =>
  new Headers({ "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sig });

describe("Replicate webhook signatures", () => {
  it("signs exactly as the Standard Webhooks specification's vector", async () => {
    expect(await signReplicateWebhook(SPEC.secret, SPEC.id, SPEC.timestamp, SPEC.body)).toBe(SPEC.signature);
  });

  it("accepts the vector's delivery within the window", async () => {
    expect(await verifyReplicateWebhook(headers(SPEC.signature), SPEC.body, SPEC.secret, at(SPEC.timestamp + 10))).toBe(true);
  });

  it("refuses a body that is not the one signed", async () => {
    expect(
      await verifyReplicateWebhook(headers(SPEC.signature), '{"test": 2432232315}', SPEC.secret, at(SPEC.timestamp))
    ).toBe(false);
  });

  it("refuses another account's secret", async () => {
    const other = "whsec_" + Buffer.from("another-account-signing-key").toString("base64");
    expect(await verifyReplicateWebhook(headers(SPEC.signature), SPEC.body, other, at(SPEC.timestamp))).toBe(false);
  });

  it("refuses a delivery older or newer than five minutes", async () => {
    const h = headers(SPEC.signature);
    expect(await verifyReplicateWebhook(h, SPEC.body, SPEC.secret, at(SPEC.timestamp + TOLERANCE_SECONDS + 1))).toBe(false);
    expect(await verifyReplicateWebhook(h, SPEC.body, SPEC.secret, at(SPEC.timestamp - TOLERANCE_SECONDS - 1))).toBe(false);
    expect(await verifyReplicateWebhook(h, SPEC.body, SPEC.secret, at(SPEC.timestamp + TOLERANCE_SECONDS))).toBe(true);
  });

  it("refuses a delivery with no signature, id or timestamp", async () => {
    const now = at(SPEC.timestamp);
    expect(await verifyReplicateWebhook(new Headers(), SPEC.body, SPEC.secret, now)).toBe(false);
    expect(
      await verifyReplicateWebhook(new Headers({ "webhook-signature": SPEC.signature }), SPEC.body, SPEC.secret, now)
    ).toBe(false);
    expect(await verifyReplicateWebhook(headers(SPEC.signature, SPEC.id, "soon"), SPEC.body, SPEC.secret, now)).toBe(false);
  });

  it("takes any one valid signature of several (a rotated secret), and ignores other schemes", async () => {
    const both = `v1,bm90LWEtc2lnbmF0dXJl ${SPEC.signature}`;
    expect(await verifyReplicateWebhook(headers(both), SPEC.body, SPEC.secret, at(SPEC.timestamp))).toBe(true);
    const v2 = SPEC.signature.replace("v1,", "v2,");
    expect(await verifyReplicateWebhook(headers(v2), SPEC.body, SPEC.secret, at(SPEC.timestamp))).toBe(false);
  });

  it("refuses, rather than throws, with a signing secret that is not base64", async () => {
    expect(await verifyReplicateWebhook(headers(SPEC.signature), SPEC.body, "whsec_%%%", at(SPEC.timestamp))).toBe(false);
  });
});

describe("the webhook URL's own token", () => {
  it("is fixed for an emoji and a stage, and differs for another of either", async () => {
    const a = await webhookToken("api-secret", "save-emoji", "AbCdEf1234");
    expect(a).toBe(await webhookToken("api-secret", "save-emoji", "AbCdEf1234"));
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(await webhookToken("api-secret", "save-emoji", "AbCdEf1235"));
    expect(a).not.toBe(await webhookToken("api-secret", "remove-background", "AbCdEf1234"));
    expect(a).not.toBe(await webhookToken("another-secret", "save-emoji", "AbCdEf1234"));
  });

  it("is compared in constant time, length first", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
