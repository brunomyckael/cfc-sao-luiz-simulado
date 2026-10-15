(() => {
  "use strict";

  const measurementId = window.SITE_GA4_MEASUREMENT_ID;
  if (typeof measurementId !== "string" || !/^G-[A-Z0-9]{6,}$/.test(measurementId.trim())) return;

  const consentKey = "cfc-sao-luiz-ga4-consent";
  const consentLifetime = 180 * 24 * 60 * 60 * 1000;
  const storedConsent = readConsent();
  const consentPanel = document.createElement("section");
  consentPanel.id = "site-analytics-consent";
  consentPanel.setAttribute("role", "dialog");
  consentPanel.setAttribute("aria-labelledby", "site-analytics-title");
  consentPanel.setAttribute("aria-describedby", "site-analytics-description");
  consentPanel.hidden = true;

  const style = document.createElement("style");
  style.textContent = `
    #site-analytics-consent{position:fixed;z-index:10000;left:16px;right:16px;bottom:16px;max-width:620px;margin:auto;padding:18px 20px;background:#fff;color:#071a35;border:1px solid #dce6f2;border-radius:16px;box-shadow:0 12px 40px #071a3540;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
    #site-analytics-consent[hidden]{display:none}
    #site-analytics-consent h2{margin:0 0 6px;font-size:18px;color:#062d63}
    #site-analytics-consent p{margin:0 0 14px}
    #site-analytics-consent a{color:#0b55b8}
    #site-analytics-consent .site-analytics-actions{display:flex;flex-wrap:wrap;gap:10px}
    #site-analytics-consent button,#site-privacy-settings{min-height:42px;padding:9px 15px;border:1px solid #0b55b8;border-radius:10px;font:700 14px system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}
    #site-analytics-consent button{background:#0b55b8;color:#fff}
    #site-analytics-consent button[data-choice="rejected"]{background:#fff;color:#0b55b8}
    #site-privacy-settings{position:fixed;z-index:9999;right:12px;bottom:12px;background:#fff;color:#0b55b8;box-shadow:0 4px 16px #071a3526}
    #site-analytics-consent button:focus-visible,#site-privacy-settings:focus-visible{outline:3px solid #ffbd20;outline-offset:2px}
    @media(max-width:480px){#site-analytics-consent .site-analytics-actions{display:grid}#site-analytics-consent button{width:100%}}
  `;

  const title = document.createElement("h2");
  title.id = "site-analytics-title";
  title.textContent = "Privacidade e análise de visitas";
  const description = document.createElement("p");
  description.id = "site-analytics-description";
  description.append("O Google Analytics ajuda o CFC São Luiz a entender visitas, páginas acessadas e como as pessoas chegam ao site. Ele só será ativado se você aceitar. Você pode mudar sua escolha depois em “Privacidade”. ");
  const policyLink = document.createElement("a");
  policyLink.href = "/politica-privacidade.html";
  policyLink.textContent = "Leia a Política de Privacidade.";
  description.append(policyLink);

  const actions = document.createElement("div");
  actions.className = "site-analytics-actions";
  const accept = makeButton("Aceitar análise", "accepted");
  const reject = makeButton("Recusar", "rejected");
  actions.append(accept, reject);
  consentPanel.append(title, description, actions);

  const privacyButton = document.createElement("button");
  privacyButton.id = "site-privacy-settings";
  privacyButton.type = "button";
  privacyButton.textContent = "Privacidade";
  privacyButton.setAttribute("aria-haspopup", "dialog");
  privacyButton.setAttribute("aria-controls", consentPanel.id);
  document.head.append(style);
  document.body.append(consentPanel, privacyButton);

  privacyButton.addEventListener("click", () => {
    consentPanel.hidden = !consentPanel.hidden;
    if (!consentPanel.hidden) accept.focus();
  });

  if (storedConsent === "accepted") startAnalytics();
  if (!storedConsent) consentPanel.hidden = false;

  function makeButton(label, choice) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.choice = choice;
    button.textContent = label;
    button.addEventListener("click", () => {
      saveConsent(choice);
      consentPanel.hidden = true;
      if (choice === "accepted") startAnalytics();
      else if (window.__siteGa4Started) window.gtag("consent", "update", { analytics_storage: "denied" });
    });
    return button;
  }

  function readConsent() {
    try {
      const value = JSON.parse(localStorage.getItem(consentKey) || "null");
      if (!value || value.expiresAt <= Date.now()) return null;
      return value.choice === "accepted" || value.choice === "rejected" ? value.choice : null;
    } catch {
      return null;
    }
  }

  function saveConsent(choice) {
    try {
      localStorage.setItem(consentKey, JSON.stringify({ choice, expiresAt: Date.now() + consentLifetime }));
    } catch {
      // The current page still honors the visitor's choice when storage is unavailable.
    }
  }

  function startAnalytics() {
    if (window.__siteGa4Started) return;
    window.__siteGa4Started = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    window.gtag("consent", "update", { analytics_storage: "granted" });
    window.gtag("js", new Date());
    window.gtag("config", measurementId.trim());
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId.trim())}`;
    document.head.append(script);
  }
})();
