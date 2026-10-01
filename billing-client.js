import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://mslokbxkhiikznkxdxih.supabase.co";
// Publishable key is intended for browser use; RLS protects user data.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ievxlpvuQxk_uOtIgdZIMQ_Ge5K_JTj";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const setStatus = (text) => { const el = document.getElementById("proStatus"); if (el) el.textContent = text; };
const credentials = () => ({
  email: document.getElementById("proEmail").value.trim(),
  password: document.getElementById("proPassword").value,
});

window.openProAccount = () => {
  document.getElementById("proAccount").classList.remove("hidden");
  setStatus("");
};
window.closeProAccount = () => document.getElementById("proAccount").classList.add("hidden");
window.proSignUp = async () => {
  const { email, password } = credentials();
  if (!email || password.length < 6) return setStatus("Informe um e-mail válido e uma senha com pelo menos 6 caracteres.");
  const { error } = await supabase.auth.signUp({ email, password });
  setStatus(error ? error.message : "Conta criada. Confira seu e-mail para confirmar o cadastro e depois entre.");
};
window.proSignIn = async () => {
  const { email, password } = credentials();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return setStatus(error.message);
  await refreshProAccess();
};
async function refreshProAccess() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) { window.__proAccessActive = false; return false; }
  const { data, error } = await supabase.from("access_grants")
    .select("expires_at").eq("user_id", user.id).eq("status", "active")
    .gt("expires_at", new Date().toISOString()).limit(1);
  if (error) { setStatus("Não foi possível consultar seu acesso agora. Tente novamente."); return false; }
  window.__proAccessActive = Boolean(data?.length);
  setStatus(window.__proAccessActive ? `Pro ativo até ${new Date(data[0].expires_at).toLocaleDateString("pt-BR")}.` : "Conta conectada. Você ainda não tem acesso Pro ativo.");
  return window.__proAccessActive;
}
window.proBuy = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return setStatus("Entre ou crie uma conta antes de comprar.");
  const { data, error } = await supabase.functions.invoke("create-mp-checkout", { body: {} });
  if (error) return setStatus("Não foi possível iniciar o checkout. Tente novamente mais tarde.");
  if (!data?.checkout_url) return setStatus(data?.error || "Checkout indisponível.");
  window.location.assign(data.checkout_url);
};
supabase.auth.onAuthStateChange((_event, session) => {
  if (session) setTimeout(() => refreshProAccess(), 0);
  else window.__proAccessActive = false;
});
document.addEventListener("DOMContentLoaded", () => {
  const query = new URLSearchParams(location.search);
  if (query.has("collection_status") || query.has("payment_id") || query.has("status")) {
    window.openProAccount();
    setStatus("Retorno recebido. Entre na sua conta para atualizar o acesso após a confirmação do pagamento.");
  }
});

