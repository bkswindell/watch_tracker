import assert from "node:assert/strict";
import { test } from "node:test";

import { approvedPosterUrl, buildApp } from "../apps/api/src/app.js";
import { MemorySliceStore } from "../apps/api/src/slice.js";

async function session(posterFetch: typeof fetch) {
  const app = await buildApp({
    readinessProbe: async () => ({ ready: true }),
    sliceStore: new MemorySliceStore({ initialPassword: "password" }),
    posterFetch,
  });
  const bootstrap = await app.inject({ method: "GET", url: "/api/bootstrap" });
  const csrf = bootstrap.json().csrfToken as string;
  await app.inject({
    method: "POST",
    url: "/api/setup",
    headers: { "x-csrf-token": csrf },
  });
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    headers: { "x-csrf-token": csrf },
    payload: { password: "password" },
  });
  return {
    app,
    cookie: String(login.headers["set-cookie"]).split(";")[0] ?? "",
  };
}

test("poster proxy allowlist rejects SSRF and ambiguous URL forms", () => {
  assert.equal(
    approvedPosterUrl("https://image.tmdb.org/t/p/w300/poster.jpg")?.hostname,
    "image.tmdb.org",
  );
  for (const invalid of [
    "http://image.tmdb.org/poster.jpg",
    "https://image.tmdb.org.evil.example/poster.jpg",
    "https://image.tmdb.org:444/poster.jpg",
    "https://user@image.tmdb.org/poster.jpg",
    "https://127.0.0.1/poster.jpg",
    "file:///etc/passwd",
    "not-a-url",
  ])
    assert.equal(approvedPosterUrl(invalid), undefined);
});

test("poster proxy requires authentication and returns only bounded approved images", async (t) => {
  const calls: string[] = [];
  const posterFetch = (async (input: URL | RequestInfo) => {
    calls.push(String(input));
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
      status: 200,
      headers: { "content-type": "image/jpeg", "content-length": "4" },
    });
  }) as typeof fetch;
  const { app, cookie } = await session(posterFetch);
  t.after(() => app.close());
  const source = encodeURIComponent(
    "https://image.tmdb.org/t/p/w300/poster.jpg",
  );

  assert.equal(
    (await app.inject({ method: "GET", url: `/tmdb-image?url=${source}` }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "GET",
        url: "/tmdb-image?url=https%3A%2F%2F127.0.0.1%2Fsecret",
        headers: { cookie },
      })
    ).statusCode,
    400,
  );
  assert.equal(calls.length, 0);

  const image = await app.inject({
    method: "GET",
    url: `/tmdb-image?url=${source}`,
    headers: { cookie },
  });
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers["content-type"], "image/jpeg");
  assert.equal(image.headers["cache-control"], "private, max-age=86400");
  assert.deepEqual(image.rawPayload, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  assert.deepEqual(calls, ["https://image.tmdb.org/t/p/w300/poster.jpg"]);
});

test("poster proxy rejects non-images and oversized responses", async (t) => {
  for (const response of [
    new Response("not an image", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
    new Response(new Uint8Array([1]), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-length": String(5 * 1024 * 1024 + 1),
      },
    }),
  ]) {
    const { app, cookie } = await session(
      (async () => response) as typeof fetch,
    );
    t.after(() => app.close());
    const result = await app.inject({
      method: "GET",
      url: "/tmdb-image?url=https%3A%2F%2Fimage.tmdb.org%2Fposter.png",
      headers: { cookie },
    });
    assert.equal(result.statusCode, 502);
    assert.equal(result.json().error.code, "poster.unavailable");
  }
});
