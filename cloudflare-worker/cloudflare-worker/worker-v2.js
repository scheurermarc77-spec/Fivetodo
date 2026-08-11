let cachedAccessToken = null;
let cachedAccessTokenUntil = 0;

function cors(origin, allowedOrigin) {
  return {
    "Access-Control-Allow-Origin":
      origin === allowedOrigin ? origin : allowedOrigin,
    "Access-Control-Allow-Headers":
      "Content-Type, X-FiveTodo-Key",
    "Access-Control-Allow-Methods":
      "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function base64Url(input) {
  const bytes =
    input instanceof Uint8Array
      ? input
      : new TextEncoder().encode(input);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function privateKeyToArrayBuffer(privateKey) {
  const normalized = privateKey
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);

  if (cachedAccessToken && cachedAccessTokenUntil > now + 60) {
    return cachedAccessToken;
  }

  const header = base64Url(JSON.stringify({
    alg: "RS256",
    typ: "JWT"
  }));

  const claims = base64Url(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/cloud-platform"
  }));

  const unsignedJwt = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyToArrayBuffer(env.FIREBASE_PRIVATE_KEY),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedJwt)
  );

  const assertion =
    `${unsignedJwt}.${base64Url(new Uint8Array(signature))}`;

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type:
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `OAuth error: ${await response.text()}`
    );
  }

  const data = await response.json();

  cachedAccessToken = data.access_token;
  cachedAccessTokenUntil = now + (data.expires_in || 3600);

  return cachedAccessToken;
}

async function loadTokens(env, accessToken) {
  const url =
    `https://firestore.googleapis.com/v1/projects/` +
    `${env.FIREBASE_PROJECT_ID}/databases/(default)` +
    `/documents/pushTokens?pageSize=100`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(
      `Firestore error: ${await response.text()}`
    );
  }

  const data = await response.json();

  return (data.documents || [])
    .map(doc => doc.fields?.token?.stringValue)
    .filter(Boolean);
}

async function sendPush(env, accessToken, token, payload) {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/` +
    `${env.FIREBASE_PROJECT_ID}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: payload.title,
            body: payload.body
          },
          webpush: {
            fcm_options: {
              link: payload.url
            }
          },
          data: {
            title: payload.title,
            body: payload.body,
            url: payload.url
          }
        }
      })
    }
  );

  return {
    ok: response.ok,
    status: response.status,
    body: response.ok ? "" : await response.text()
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin, env.ALLOWED_ORIGIN);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers
      });
    }

    if (request.method === "GET") {
      return new Response("FiveTodo Push Worker läuft.", {
        status: 200,
        headers
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers
      });
    }

    if (origin !== env.ALLOWED_ORIGIN) {
      return new Response("Origin not allowed", {
        status: 403,
        headers
      });
    }

    if (
      request.headers.get("X-FiveTodo-Key") !== env.APP_KEY
    ) {
      return new Response("Forbidden", {
        status: 403,
        headers
      });
    }

    try {
      const data = await request.json();

      const todoText =
        String(data.todoText || "Todo").slice(0, 140);

      const completed = data.kind === "completed";

      const payload = {
        title: completed
          ? "✅ Aufgabe erledigt"
          : "🆕 Neue Aufgabe",
        body: completed
          ? `Erledigt: ${todoText}`
          : `Neu: ${todoText}`,
        url:
          data.url ||
          "https://scheurermarc77-spec.github.io/Fivetodo/"
      };

      const accessToken = await getAccessToken(env);
      const tokens = await loadTokens(env, accessToken);

      const targets = tokens.filter(
        token => token && token !== data.senderToken
      );

      const results = await Promise.all(
        targets.map(token =>
          sendPush(env, accessToken, token, payload)
        )
      );

      return new Response(
        JSON.stringify({
          ok: true,
          targets: targets.length,
          delivered: results.filter(r => r.ok).length,
          failed: results.filter(r => !r.ok).length
        }),
        {
          headers: {
            ...headers,
            "Content-Type": "application/json"
          }
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: String(error?.message || error)
        }),
        {
          status: 500,
          headers: {
            ...headers,
            "Content-Type": "application/json"
          }
        }
      );
    }
  }
};
