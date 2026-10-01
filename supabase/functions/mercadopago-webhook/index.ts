import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function parseSignature(value: string | null) {
  let ts = "";
  let v1 = "";
  for (const part of (value ?? "").split(",")) {
    const [key, val] = part.split("=", 2);
    if (key?.trim() === "ts") ts = val?.trim() ?? "";
    if (key?.trim() === "v1") v1 = val?.trim() ?? "";
  }
  return { ts, v1 };
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  ));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: true });

  try {
    const url = new URL(req.url);
    const payload = await req.json().catch(() => ({}));
    const eventType = String(payload?.type ?? url.searchParams.get("type") ?? "");
    const action = String(payload?.action ?? "");

    // Application-link events are not payment events and need no payment lookup.
    // Acknowledge other explicitly typed events too so the provider does not retry
    // notifications this integration is not configured to process.
    if (eventType && eventType !== "payment") {
      return json({ ok: true, ignored: true });
    }
    if (action === "application.authorized") {
      return json({ ok: true, ignored: true });
    }

    const secret = Deno.env.get("MP_WEBHOOK_SECRET");
    const accessToken = Deno.env.get("MP_ACCESS_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!secret || !accessToken || !supabaseUrl || !serviceRoleKey) {
      console.error("mercadopago-webhook configuration is incomplete");
      return json({ error: "Webhook não configurado no servidor" }, 503);
    }

    const xSignature = req.headers.get("x-signature");
    const xRequestId = req.headers.get("x-request-id");
    const dataId = (url.searchParams.get("data.id") ?? "").toLowerCase();
    const { ts, v1 } = parseSignature(xSignature);

    if (!ts || !v1 || !xRequestId || !dataId) {
      return json({ error: "Assinatura ausente ou incompleta" }, 401);
    }

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expected = await hmacSha256(secret, manifest);

    if (!safeEqual(expected, v1)) {
      return json({ error: "Assinatura inválida" }, 401);
    }

    const payloadPaymentId = payload?.data?.id == null ? "" : String(payload.data.id).toLowerCase();
    if (payloadPaymentId && payloadPaymentId !== dataId) {
      return json({ error: "ID do pagamento não corresponde à assinatura" }, 401);
    }
    const paymentId = dataId;

    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!paymentResponse.ok) {
      console.error("Mercado Pago payment lookup failed", {
        status: paymentResponse.status,
      });
      return json({ error: "Não foi possível consultar o pagamento" }, 502);
    }

    const payment = await paymentResponse.json();
    const externalReference = payment.external_reference;
    if (!externalReference) return json({ ok: true });

    const rpcResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/apply_payment_event`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_order_id: externalReference,
          p_payment_id: String(payment.id),
          p_status: payment.status,
          p_amount: Number(payment.transaction_amount ?? 0),
          p_currency: payment.currency_id ?? "",
        }),
      },
    );

    const rpcResult = rpcResponse.ok ? await rpcResponse.json().catch(() => null) : null;
    if (!rpcResponse.ok || rpcResult !== true) {
      console.error("apply_payment_event failed", { status: rpcResponse.status, accepted: rpcResult === true });
      return json({ error: "Falha ao processar evento de pagamento" }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("mercadopago-webhook error", error);
    return json({ error: "Erro interno" }, 500);
  }
});
