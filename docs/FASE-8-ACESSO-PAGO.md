# FASE 8 — plano de implantação

1. Criar/conectar projeto Supabase.
2. Aplicar supabase/migrations/20260930000000_billing_access.sql.
3. Ativar autenticação por e-mail no Supabase.
4. Publicar supabase/functions/billing/index.ts como billing.
5. Cadastrar os segredos da função.
6. Criar aplicação de produção no Mercado Pago.
7. Cadastrar o webhook de payment apontando para MP_WEBHOOK_URL.
8. Fazer teste de pagamento.
9. Integrar o index.html com login, trial/claim, access e checkout.
10. Testar expiração, compra duplicada, pagamento pendente, rejeitado, reembolso e repetição do webhook.
11. Promover para main somente após os testes.

A main continua intocada nesta fase.
Commit-base: a7e25a7ae9f108b9371057bd6d736aac0cdb53dc
Branch: fase-8-acesso-pago
