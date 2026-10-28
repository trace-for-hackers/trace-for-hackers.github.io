/* ==========================================================================
   TRACE — static site script
   No dependencies. Loaded with `defer`. Compatible with the site's CSP
   (no inline scripts, no eval, no inline styles).
   ========================================================================== */

/* --------------------------------------------------------------------------
   EMAIL FORM CONFIGURATION
   --------------------------------------------------------------------------
   A static site cannot store data. For the mailing list to work, point
   `endpoint` at a service that accepts sign-ups without a secret key in
   the browser:

   - Formspree:  endpoint "https://formspree.io/f/YOUR_ID",   format "json"
   - Buttondown: endpoint "https://buttondown.com/api/emails/embed-subscribe/YOUR_USER", format "form"
   - Brevo:      action URL of a Brevo hosted form,          format "form", field "EMAIL"
   - Your own function (Cloudflare Worker / Supabase Edge Function / Vercel)
     that calls Resend, Mailchimp, ConvertKit or Brevo with the key kept
     ON THE SERVER: endpoint "https://api.yourdomain.com/subscribe", format "json"

   NEVER put an API key here: this file is public.
   After setting the endpoint, add its origin to `connect-src` in the CSP
   (the <meta> tag in every HTML file and the _headers file).

   While `endpoint` is empty, the form does NOT fake success in production:
   it tells visitors that sign-ups aren't open yet. On localhost it simulates
   success so you can test the visual states.
   -------------------------------------------------------------------------- */
const SUBSCRIBE = {
  endpoint: "",
  format: "json",          // "json" or "form"
  field: "email",          // field name expected by the service
  timeoutMs: 10000,
};

(function () {
  "use strict";

  const root = document.documentElement;
  root.classList.add("js");

  /* Clickjacking defense for hosts that can't send headers
     (e.g. GitHub Pages). On Cloudflare/Netlify, _headers already covers it. */
  if (window.top !== window.self) {
    root.classList.add("is-framed");
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Mobile menu ---------------- */
  const toggle = document.querySelector("[data-menu-toggle]");
  const menu = document.getElementById("mobile-menu");

  if (toggle && menu) {
    toggle.hidden = false;
    const panel = menu.querySelector(".mobile-menu__panel");
    const closers = menu.querySelectorAll("[data-menu-close]");
    let lastFocus = null;

    const focusables = () =>
      Array.from(panel.querySelectorAll("a[href], button:not([disabled])"));

    const open = () => {
      lastFocus = document.activeElement;
      menu.hidden = false;
      void menu.offsetWidth; // force reflow so the transition runs
      menu.classList.add("is-open");
      document.body.classList.add("menu-open");
      toggle.setAttribute("aria-expanded", "true");
      const first = focusables()[0];
      if (first) first.focus();
    };

    const close = (restoreFocus = true) => {
      menu.classList.remove("is-open");
      document.body.classList.remove("menu-open");
      toggle.setAttribute("aria-expanded", "false");
      const done = () => { menu.hidden = true; };
      if (reducedMotion) done(); else setTimeout(done, 250);
      if (restoreFocus && lastFocus) lastFocus.focus();
    };

    toggle.addEventListener("click", () => {
      toggle.getAttribute("aria-expanded") === "true" ? close() : open();
    });
    closers.forEach((el) => el.addEventListener("click", () => close()));
    panel.querySelectorAll("a[href]").forEach((a) =>
      a.addEventListener("click", () => close(false))
    );

    menu.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    window.matchMedia("(min-width: 64rem)").addEventListener("change", (mq) => {
      if (mq.matches && !menu.hidden) close(false);
    });
  }

  /* ---------------- Reveal on scroll ---------------- */
  const revealEls = document.querySelectorAll("[data-reveal]");
  if (revealEls.length) {
    if (reducedMotion || !("IntersectionObserver" in window)) {
      revealEls.forEach((el) => el.classList.add("is-visible"));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
      revealEls.forEach((el) => io.observe(el));
    }
  }

  /* ---------------- Email form ---------------- */
  const form = document.getElementById("signup-form");
  if (!form) return;

  const input = form.querySelector("#email");
  const button = form.querySelector("button[type=submit]");
  const status = form.querySelector("#email-status");
  const honeypot = form.querySelector("[name=company_website]");
  const loadedAt = Date.now();
  const buttonLabel = button.textContent;
  const SUCCESS = "You're on the list. We'll keep you posted on TRACE.";

  // Pragmatic validation (the receiving service must validate again).
  const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,63}$/;
  const CONTROL_RE = /[\u0000-\u001F\u007F]/;

  const validate = (raw) => {
    const value = raw.trim();
    if (!value) return { ok: false, message: "Enter your email address." };
    if (value.length > 254) return { ok: false, message: "That email address is too long." };
    if (CONTROL_RE.test(value) || !EMAIL_RE.test(value)) {
      return { ok: false, message: "Enter a valid email address." };
    }
    return { ok: true, value };
  };

  const setState = (state, message) => {
    status.textContent = message || "";
    status.classList.toggle("is-error", state === "error");
    status.classList.toggle("is-success", state === "success");
    input.setAttribute("aria-invalid", state === "error" ? "true" : "false");
    const busy = state === "sending";
    const done = state === "success";
    input.disabled = busy || done;
    button.disabled = busy || done;
    form.setAttribute("aria-busy", busy ? "true" : "false");
    button.textContent = busy ? "Sending…" : done ? "Subscribed" : buttonLabel;
  };

  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ||
    location.protocol === "file:";

  async function submitEmail(email) {
    if (!SUBSCRIBE.endpoint) {
      if (isLocal) {
        // Simulation for local development only.
        await new Promise((r) => setTimeout(r, 800));
        return;
      }
      const err = new Error("not-configured");
      err.code = "not-configured";
      throw err;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUBSCRIBE.timeoutMs);
    try {
      const isJson = SUBSCRIBE.format === "json";
      const body = isJson
        ? JSON.stringify({ [SUBSCRIBE.field]: email })
        : new URLSearchParams({ [SUBSCRIBE.field]: email });
      const res = await fetch(SUBSCRIBE.endpoint, {
        method: "POST",
        headers: isJson
          ? { "Content-Type": "application/json", Accept: "application/json" }
          : { Accept: "application/json" },
        body,
        credentials: "omit",
        referrerPolicy: "strict-origin-when-cross-origin",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("http-" + res.status);
    } finally {
      clearTimeout(timer);
    }
  }

  input.addEventListener("input", () => {
    if (input.getAttribute("aria-invalid") === "true") setState("idle", "");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return;

    const result = validate(input.value);
    if (!result.ok) {
      setState("error", result.message);
      input.focus();
      return;
    }

    // Anti-bot: filled honeypot or instant submit => silently drop.
    if ((honeypot && honeypot.value) || Date.now() - loadedAt < 1500) {
      setState("success", SUCCESS);
      return;
    }

    setState("sending", "");
    try {
      await submitEmail(result.value);
      input.value = "";
      setState("success", SUCCESS);
    } catch (err) {
      if (err && err.code === "not-configured") {
        setState("error", "Sign-ups aren't open yet. Please try again soon.");
      } else {
        setState("error", "Something went wrong. Please try again.");
      }
    }
  });
})();
