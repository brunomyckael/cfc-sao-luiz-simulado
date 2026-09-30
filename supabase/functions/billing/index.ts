import { createHmac, timingSafeEqual } from "node:crypto";

const PRODUCT_CODE = "cfc-pro-30d";
const PRODUCT_PRICE = 4.99;
const PRODUCT_DAYS = 30;

function responseJson(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }, headers || {})
  });
}

function origins(env) {
  return String(env.SITE_ORIGINS || "").split(",").map(function(v){return v.trim();}).filter(Boolean);
}

function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const list = origins(env);
  const h = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin"
  };
  if (list.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function originAllowed(request, env) {
  const origin = request.headers.get("Origin");
  return !origin || origins(env).includes(origin);
}

async function requireUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");

  const r = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: auth }
  });
  if (!r.ok) throw new Error("UNAUTHORIZED");

  const user = await r.json();
  if (!user || !user.id || !user.email) throw new Error("UNAUTHORIZED");
  return { id: user.id, email: user.email };
}

async function dbRpc(env, name, args) {
  const r = await fetch(env.SUPABASE_URL + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  });
  if (!r.ok) throw new Error("DB_RPC_FAILED");
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function db(env, path, init) {
  const r = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, Object.assign({
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json"
    }
  }, init || {}));
  if (!r.ok) throw new Error("DB_QUERY_FAILED");
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

function parseSignature(value) {
  const out = {};
  String(value || "").split(",").forEach(function(part){
    const pair = part.trim().split("=", 2);
    if (pair.length === 2) out[pair[0]] = pair[1];
  });
  return out;
}

function safeEqual(a, b) {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function freshTimestamp(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n)) return false;
  const ms = n > 1000000000000 ? n : n * 1000;
  return Math.abs(Date.now() - ms) <= 5 * 60 * 1000;
}

async function verifyWebhook(request, env) {
  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  if (!signature || !requestId) return false;

  const url = new URL(request.url);
  const dataId = String(url.searchParams.get("data.id") || "").toLowerCase();
  if (!dataId) return false;

  const p = parseSignature(signature);
  if (!p.ts || !p.v1 || !freshTimestamp(p.ts)) return false;

  const manifest = "id:" + dataId + ";request-id:" + requestId + ";ts:" + p.ts + ";";
  const expected = createHmac("sha256", env.MP_WEBHOOK_SECRET)
    .update(manifest)
    .digest("hex");

  return safeEqual(expected, p.v1);
}

async function mpPreference(env, orderId, email) {
  const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.MP_ACCESS_TOKEN,
      "Content-Type": "application/json",
      "X-Idempotency-Key": orderId
    },
    body: JSON.stringify({
      external_reference: orderId,
      payer: { email: email },
      items: [{
        id: PRODUCT_CODE,
        title: "Acesso Pro — Simulado CNH Goiás",
        description: "Acesso completo por 30 dias",
        quantity: 1,
        currency_id: "BRL",
        unit_price: PRODUCT_PRICE
      }],
      notification_url: env.MP_WEBHOOK_URL,
      back_urls: {
        success: env.SITE_URL + "/?pagamento=sucesso",
        pending: env.SITE_URL + "/?pagamento=pendente",
        failure: env.SITE_URL + "/?pagamento=erro"
      },
      auto_return: "approved"
    })
  });

  if (!r.ok) throw new Error("MP_PREFERENCE_FAILED");
  return await r.json();
}

async function mpPayment(env, paymentId) {
  const r = await fetch("https://api.mercadopago.com/v1/payments/" + encodeURIComponent(paymentId), {
    headers: { Authorization: "Bearer " + env.MP_ACCESS_TOKEN }
  });
  if (!r.ok) throw new Error("MP_PAYMENT_LOOKUP_FAILED");
  return await r.json();
}

async function access(request, env) {
  const user = await requireUser(request, env);
  const state = await dbRpc(env, "get_access_state", { p_user_id: user.id });
  const row = Array.isArray(state) ? state[0] : state;
  return responseJson({
    active: Boolean(row && row.active),
    expires_at: row && row.expires_at ? row.expires_at : null,
    trial_available: Boolean(row && row.trial_available)
  }, 200, cors(request, env));
}

async function trial(request, env) {
  const user = await requireUser(request, env);
  const granted = await dbRpc(env, "claim_free_trial", { p_user_id: user.id });
  return responseJson({
    granted: Boolean(granted),
    message: Boolean(granted)
      ? "Primeiro simulado gratuito liberado."
      : "O benefício gratuito desta conta já foi utilizado."
  }, Boolean(granted) ? 200 : 409, cors(request, env));
}

async function checkout(request, env) {
  const user = await requireUser(request, env);
  const state = await dbRpc(env, "get_access_state", { p_user_id: user.id });
  const current = Array.isArray(state) ? state[0] : state;

  if (current && current.active) {
    return responseJson({ error: "ALREADY_ACTIVE", expires_at: current.expires_at }, 409, cors(request, env));
  }

  const orderId = crypto.randomUUID();
  const rows = await db(env, "orders", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: orderId,
      user_id: user.id,
      amount: PRODUCT_PRICE,
      currency: "BRL",
      product_code: PRODUCT_CODE,
      status: "pending",
      external_reference: orderId
    })
  });

  const order = Array.isArray(rows) ? rows[0] : rows;
  try {
    const pref = await mpPreference(env, order.id, user.email);
    const url = pref.init_point || pref.sandbox_init_point;
    if (!url) throw new Error("MP_NO_CHECKOUT_URL");

    await db(env, "orders?id=eq." + encodeURIComponent(order.id), {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ mp_preference_id: pref.id || url })
    });

    return responseJson({
      checkout_url: url,
      order_id: order.id,
      amount: PRODUCT_PRICE,
      days: PRODUCT_DAYS
    }, 200, cors(request, env));
  } catch (e) {
    await db(env, "orders?id=eq." + encodeURIComponent(order.id), {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "cancelled" })
    }).catch(function(){});
    throw e;
  }
}

async function webhook(request, env) {
  if (!(await verifyWebhook(request, env))) {
    return responseJson({ error: "INVALID_SIGNATURE" }, 401);
  }

  const payload = await request.json().catch(function(){ return {}; });
  if (!payload || payload.type !== "payment" || !payload.data || !payload.data.id) {
    return responseJson({ received: true });
  }

  const paymentId = String(payload.data.id);
  const payment = await mpPayment(env, paymentId);
  const external = String(payment.external_reference || "");
  const amount = Number(payment.transaction_amount);
  const currency = String(payment.currency_id || "");

  if (!external) return responseJson({ received: true });
  if (amount !== PRODUCT_PRICE || currency !== "BRL") {
    return responseJson({ error: "PAYMENT_MISMATCH" }, 422);
  }

  const orders = await db(env,
    "orders?id=eq." + encodeURIComponent(external) +
    "&select=id,user_id,status,amount,currency&limit=1"
  );

  if (!Array.isArray(orders) || !orders[0]) return responseJson({ received: true });

  const s = String(payment.status || "unknown");
  const mapped =
    s === "approved" ? "approved" :
    s === "refunded" ? "refunded" :
    s === "charged_back" ? "charged_back" :
    s === "cancelled" ? "cancelled" :
    s === "rejected" ? "rejected" :
    s === "in_process" ? "in_process" : "pending";

  await dbRpc(env, "apply_payment_event", {
    p_order_id: orders[0].id,
    p_payment_id: paymentId,
    p_status: mapped,
    p_amount: amount,
    p_currency: currency
  });

  return responseJson({ received: true });
}

export default async function handler(request, env) {
  const ch = cors(request, env);

  if (request.method === "OPTIONS") {
    if (!originAllowed(request, env)) return responseJson({ error: "ORIGIN_NOT_ALLOWED" }, 403, ch);
    return new Response(null, { status: 204, headers: ch });
  }

  try {
    const path = new URL(request.url).pathname;

    if (path.endsWith("/webhooks/mercadopago")) {
      return await webhook(request, env);
    }

    if (!originAllowed(request, env)) {
      return responseJson({ error: "ORIGIN_NOT_ALLOWED" }, 403, ch);
    }

    if (path.endsWith("/health") && request.method === "GET") {
      return responseJson({ ok: true, product: PRODUCT_CODE }, 200, ch);
    }
    if (path.endsWith("/access") && request.method === "GET") {
      return await access(request, env);
    }
    if (path.endsWith("/trial/claim") && request.method === "POST") {
      return await trial(request, env);
    }
    if (path.endsWith("/checkout") && request.method === "POST") {
      return await checkout(request, env);
    }

    return responseJson({ error: "NOT_FOUND" }, 404, ch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "UNAUTHORIZED") return responseJson({ error: "UNAUTHORIZED" }, 401, ch);
    console.error(msg);
    return responseJson({ error: "INTERNAL_ERROR" }, 500, ch);
  }
}
