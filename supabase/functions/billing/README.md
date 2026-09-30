# FASE 8 — Acesso Pro

Modelo:
- 1º simulado completo gratuito por conta;
- R$ 4,99 por 30 dias;
- Mercado Pago para checkout;
- Supabase Auth + PostgreSQL para identidade e concessão;
- Webhook server-side para confirmação;
- nenhuma credencial de pagamento no frontend.

## Segredos

Configure no ambiente da Edge Function:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- MP_ACCESS_TOKEN
- MP_WEBHOOK_SECRET
- MP_WEBHOOK_URL
- SITE_ORIGINS
- SITE_URL

Exemplo de produção:
SITE_ORIGINS=https://simuladocnhgoias.com.br,https://www.simuladocnhgoias.com.br
SITE_URL=https://simuladocnhgoias.com.br

Nunca colocar os segredos no Git.

## Rotas

GET  /functions/v1/billing/health
GET  /functions/v1/billing/access
POST /functions/v1/billing/trial/claim
POST /functions/v1/billing/checkout
POST /functions/v1/billing/webhooks/mercadopago

A rota do webhook deve ser pública para o Mercado Pago, mas só aceita notificações com assinatura HMAC válida.

## Regras

O navegador não é a fonte de verdade do acesso.
O pagamento só libera acesso após:
1. validação da assinatura do webhook;
2. consulta do pagamento pela API do Mercado Pago;
3. validação do valor R$ 4,99 e moeda BRL;
4. vínculo do pagamento com um pedido criado pelo servidor;
5. concessão idempotente no banco.

Compras sobrepostas somam 30 dias ao fim do acesso vigente.

## Deploy

A migration deve ser aplicada primeiro. Depois publique a Edge Function e configure os segredos. Só depois integramos Auth e as telas do index.html.
