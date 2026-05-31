import test from "node:test";
import assert from "node:assert/strict";

import { assertSafePublicUrl } from "@/lib/network/ssrf";

test("assertSafePublicUrl rejects IPv4 loopback literals", async () => {
  await assert.rejects(
    () => assertSafePublicUrl("http://127.0.0.1/"),
    /private network/i
  );
});

test("assertSafePublicUrl rejects IPv6 loopback literals", async () => {
  await assert.rejects(
    () => assertSafePublicUrl("http://[::1]/"),
    /private network/i
  );
});

test("assertSafePublicUrl rejects IPv4-mapped IPv6 private literals", async () => {
  await assert.rejects(
    () => assertSafePublicUrl("http://[::ffff:10.0.0.1]/"),
    /private network/i
  );
});

test("assertSafePublicUrl accepts public IP literals without DNS lookup", async () => {
  const resolved = await assertSafePublicUrl("https://93.184.216.34/");

  assert.equal(resolved.hostname, "93.184.216.34");
  assert.deepEqual(resolved.resolvedAddresses, [
    { address: "93.184.216.34", family: 4 },
  ]);
});
