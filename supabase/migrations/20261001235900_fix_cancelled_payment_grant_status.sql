CREATE OR REPLACE FUNCTION public.apply_payment_event(
  p_order_id uuid,
  p_payment_id text,
  p_status text,
  p_amount numeric,
  p_currency text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%rowtype;
  v_base timestamptz;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_amount <> 4.99 OR p_currency <> 'BRL' THEN
    RAISE EXCEPTION 'Pagamento incompatível com o produto';
  END IF;

  UPDATE public.orders
  SET status = p_status,
      mp_payment_id = coalesce(p_payment_id, mp_payment_id),
      updated_at = now()
  WHERE id = p_order_id;

  IF p_status = 'approved' AND p_payment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.access_grants
      WHERE payment_id = p_payment_id
    ) THEN
      SELECT greatest(now(), coalesce(max(g.expires_at), now()))
      INTO v_base
      FROM public.access_grants g
      WHERE g.user_id = v_order.user_id
        AND g.status = 'active'
        AND g.expires_at > now();

      INSERT INTO public.access_grants(
        user_id, order_id, payment_id, status, starts_at, expires_at
      )
      VALUES(
        v_order.user_id, v_order.id, p_payment_id, 'active',
        v_base, v_base + interval '30 days'
      );
    END IF;
  ELSIF p_status IN ('refunded', 'charged_back', 'cancelled') THEN
    UPDATE public.access_grants
    SET status = CASE WHEN p_status = 'cancelled' THEN 'revoked' ELSE p_status END,
        updated_at = now()
    WHERE payment_id = p_payment_id;
  END IF;

  RETURN true;
END;
$function$;
