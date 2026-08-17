// Guard: a push notification is always addressed to somebody.
//
// Six endpoints each carried a comment saying "push the owner" directly above
// a call that pushed to EVERY device registered to the org. In org_sdubmedia
// that was three staff and two clients, so "Payment received — $2,400 paid"
// and every website inquiry went to client phones for as long as the iOS app
// had been installed.
//
// The whole-org sender is gone. This fails the build if one comes back, or if
// a new endpoint reaches for an unscoped push, because the symptom is
// invisible from our side — the wrong person's phone lights up, not ours.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const API_DIR = path.resolve(import.meta.dirname, "../../../../api");
const apiFiles = readdirSync(API_DIR).filter(f => f.endsWith(".ts"));

const source = (f: string) => readFileSync(path.join(API_DIR, f), "utf8");

describe("push notification scoping", () => {
  it("has no whole-org push sender", () => {
    expect(source("_apns.ts")).not.toMatch(/export\s+async\s+function\s+sendPushToOrg\b/);
  });

  it("exports only role-scoped and user-scoped senders", () => {
    const exported = [...source("_apns.ts").matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)]
      .map(m => m[1])
      .filter(n => n.startsWith("sendPush"));
    expect(exported.sort()).toEqual(["sendPushToOwner", "sendPushToRoles", "sendPushToUser"]);
  });

  it("is never called unscoped from an endpoint", () => {
    const offenders = apiFiles.filter(f => /\bsendPushToOrg\s*\(/.test(source(f)));
    expect(offenders).toEqual([]);
  });

  it("only ever sends through one of the three senders", () => {
    const allowed = /\bsendPushTo(Owner|Roles|User)\s*\(/;
    const offenders: string[] = [];
    for (const f of apiFiles) {
      if (f === "_apns.ts") continue;
      for (const call of source(f).match(/\bsendPushTo\w*\s*\(/g) || []) {
        if (!allowed.test(call)) offenders.push(`${f}: ${call}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
