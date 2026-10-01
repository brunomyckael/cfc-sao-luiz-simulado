import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Não autenticado" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("create-mp-checkout Supabase configuration is incomplete");
      return json({ error: "Configuração do Supabase incompleta" }, 500);
    }
    if (!mpAccessToken) {
      console.error("create-mp-checkout Mercado Pago configuration is incomplete");
      return json({ error: "Mercado Pago ainda não configurado no servidor" }, 503);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Sessão inválida" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: active, error: activeError } = await admin
      .from("access_grants")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .limit(1);

    if (activeError) {
      console.error("create-mp-checkout access lookup failed", activeError);
      return json({ error: "Erro ao consultar acesso" }, 500);
    }
    if (active && active.length > 0) {
      return json({ error: "Usuário já possui acesso Pro ativo" }, 409);
    }

    // Reuse an open preference on retries; never create parallel pending orders.
    const { data: pendingRows, error: pendingError } = await admin
      .from("orders")
      .select("id, external_reference, mp_init_point")
      .eq("user_id", user.id)
      .in("status", ["pending", "in_process"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (pendingError) {
      console.error("create-mp-checkout pending order lookup failed", pendingError);
      return json({ error: "Erro ao consultar pedidos" }, 500);
    }

    let orderId = pendingRows?.[0]?.id as string | undefined;
    const pendingOrder = pendingRows?.[0];

    // Orders created by the old implementation used an unrelated external_reference.
    // Retire those still-pending rows so the webhook cannot acknowledge a lost grant.
    if (pendingOrder && pendingOrder.external_reference !== pendingOrder.id) {
      const { error } = await admin.from("orders").update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      }).eq("id", pendingOrder.id);
      if (error) {
        console.error("create-mp-checkout legacy pending order cleanup failed", error);
        return json({ error: "Não foi possível atualizar o pedido pendente" }, 500);
      }
      orderId = undefined;
    } else if (pendingOrder?.mp_init_point) {
      return json({
        order_id: pendingOrder.id,
        checkout_url: pendingOrder.mp_init_point,
        amount: 4.99,
        days: 30,
        reused: true,
      }, 200);
    }

    const isNewOrder = !orderId;
    orderId ??= crypto.randomUUID();

    if (isNewOrder) {
      const { error: orderError } = await admin.from("orders").insert({
        id: orderId,
        user_id: user.id,
        amount: 4.99,
        currency: "BRL",
        product_code: "cfc-pro-30d",
        status: "pending",
        external_reference: orderId,
      });
      if (orderError) {
        // A concurrent request may have created the unique pending order first.
        const { data: racedRows } = await admin
          .from("orders")
          .select("id, external_reference, mp_init_point")
          .eq("user_id", user.id)
          .in("status", ["pending", "in_process"])
          .order("created_at", { ascending: false })
          .limit(1);
        const raced = racedRows?.[0];
        if (!raced || raced.external_reference !== raced.id) {
          console.error("create-mp-checkout order insert failed", orderError);
          return json({ error: "Não foi possível criar o pedido" }, 500);
        }
        orderId = raced.id;
        if (raced.mp_init_point) {
          return json({
            order_id: raced.id,
            checkout_url: raced.mp_init_point,
            amount: 4.99,
            days: 30,
            reused: true,
          }, 200);
        }
      }
    }

    const origin = req.headers.get("origin") || "";
    const preference = {
      items: [{
        id: "cfc-pro-30d",
        title: "CFC São Luiz - Acesso Pro por 30 dias",
        quantity: 1,
        currency_id: "BRL",
        unit_price: 4.99,
      }],
      external_reference: orderId,
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
      metadata: { order_id: orderId, user_id: user.id },
      ...(origin ? {
        back_urls: { success: origin, pending: origin, failure: origin },
        auto_return: "approved",
      } : {}),
    };

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": orderId,
      },
      body: JSON.stringify(preference),
    });
    const mpData = await mpResponse.json().catch(() => ({}));

    if (!mpResponse.ok || !mpData.id || !mpData.init_point) {
      console.error("Mercado Pago preference creation failed", {
        status: mpResponse.status,
      });
      await admin.from("orders").update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      }).eq("id", orderId);
      return json({ error: "Mercado Pago recusou a criação do checkout" }, 502);
    }

    const { error: updateError } = await admin.from("orders").update({
      mp_preference_id: mpData.id,
      mp_init_point: mpData.init_point,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);

    if (updateError) {
      console.error("create-mp-checkout preference persistence failed", updateError);
      return json({ error: "Checkout criado, mas não foi possível registrar o pedido" }, 500);
    }

    return json({
      order_id: orderId,
      checkout_url: mpData.init_point,
      amount: 4.99,
      days: 30,
    }, 201);
  } catch (error) {
    console.error("create-mp-checkout error", error);
    return json({ error: "Erro interno ao criar checkout" }, 500);
  }
});

