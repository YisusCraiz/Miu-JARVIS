"use strict";
const $ = (id) => document.getElementById(id);
let token = "", session = crypto.randomUUID(), busy = false, connected = false;
let settings = null;
function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
function controls() {
  for (const id of ["message", "send", "provider", "new-chat", "delete-chat"]) {
    $(id).disabled = !connected || busy;
  }
  $("disconnect").disabled = busy;
  for (const b of document.querySelectorAll("#sessions button, .suggestions button")) {
    b.disabled = !connected || busy;
  }
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options, cache: "no-store", credentials: "omit", redirect: "error",
    headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"},
  });
  if (!response.ok) {
    const descriptions = {
      401: "Token incorrecto o vencido. Desconecta y vuelve a conectar.",
      403: "Autoriza el envío a la nube antes de continuar.",
      422: "Revisa el mensaje: debe contener entre 1 y 8000 caracteres.",
      503: "El modelo no está disponible. Comprueba Ollama o la configuración de nube.",
    };
    throw new Error(descriptions[response.status] || "No se pudo completar la solicitud.");
  }
  return response.status === 204 ? null : response.json();
}
function showError(error) {
  status(error instanceof TypeError ? "No hay conexión con Miu. Comprueba que el programa siga abierto." : error.message, true);
}
function bubble(role, content) {
  const element = document.createElement("div");
  element.className = `bubble ${role === "user" ? "user" : "assistant"}`;
  const label = document.createElement("strong");
  label.textContent = role === "user" ? "TÚ" : "MIU";
  element.append(label, document.createTextNode(content));
  $("messages").append(element);
  $("messages").scrollTop = $("messages").scrollHeight;
}
const welcome = $("messages").firstElementChild.cloneNode(true);
function emptyChat() {
  $("messages").replaceChildren(welcome.cloneNode(true));
  controls();
}
function updateProvider() {
  const cloud = $("provider").value === "cloud";
  $("cloud-notice").hidden = !cloud;
  $("consent").checked = false;
  $("model").textContent = settings ? (cloud ? settings.cloud_model : settings.local_model) : "Sin conexión";
}
async function sessions() {
  const data = await api("/v1/sessions");
  $("sessions").replaceChildren();
  if (!data.sessions.length) {
    const p = document.createElement("p"); p.className = "muted";
    p.textContent = "Tu próxima conversación empieza aquí."; $("sessions").append(p);
  }
  for (const item of data.sessions) {
    const b = document.createElement("button");
    b.textContent = item.title; b.title = item.title;
    b.setAttribute("aria-current", String(item.id === session));
    b.disabled = busy;
    b.addEventListener("click", () => load(item.id));
    $("sessions").append(b);
  }
}
async function load(id) {
  if (busy) return;
  busy = true; controls();
  try {
    const data = await api(`/v1/sessions/${encodeURIComponent(id)}`);
    session = id; $("messages").replaceChildren();
    for (const m of data.messages) bubble(m.role, m.content);
    if (!data.messages.length) emptyChat();
    $("consent").checked = false;
    status(`Contexto reciente: hasta ${settings.history_messages} mensajes.`);
    await sessions();
  } catch (error) { showError(error); }
  finally { busy = false; controls(); }
}
$("connect-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("connect-button").disabled = true;
  token = $("token").value.trim();
  try {
    settings = await api("/v1/settings");
    await sessions();
    connected = true;
    $("token").value = "";
    $("connection").hidden = true;
    $("disconnect").hidden = false;
    $("provider").querySelector('[value="cloud"]').disabled = !settings.cloud_available;
    updateProvider(); controls(); status("Conectado. Todo listo para conversar.");
    $("message").focus();
  } catch (error) { token = ""; settings = null; showError(error); }
  finally { $("connect-button").disabled = false; }
});
$("disconnect").addEventListener("click", () => {
  token = ""; settings = null; connected = false; session = crypto.randomUUID();
  $("message").value = ""; $("provider").value = "ollama";
  $("connection").hidden = false; $("disconnect").hidden = true;
  $("sessions").replaceChildren(); emptyChat(); updateProvider();
  status("Desconectado. El historial permanece en tu servidor.");
});
$("new-chat").addEventListener("click", () => {
  session = crypto.randomUUID(); $("message").value = ""; $("consent").checked = false;
  emptyChat();
  for (const b of $("sessions").querySelectorAll("button")) b.setAttribute("aria-current", "false");
  status("Nueva conversación. El contexto empieza desde cero."); $("message").focus();
});
$("provider").addEventListener("change", updateProvider);
$("messages").addEventListener("click", (event) => {
  if (event.target.matches(".suggestions button") && connected && !busy) {
    $("message").value = event.target.textContent; $("message").focus();
  }
});
$("message").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault(); if (!busy) $("chat-form").requestSubmit();
  }
});
$("chat-form").addEventListener("submit", async (event) => {
  event.preventDefault(); if (busy || !connected) return;
  const message = $("message").value.trim(), provider = $("provider").value;
  if (!message) return;
  if (provider === "cloud" && !$("consent").checked) {
    status("Marca la autorización para enviar esta pregunta y su contexto a la nube.", true); return;
  }
  busy = true; controls(); status("Miu está pensando…");
  $("consent").checked = false;
  try {
    const data = await api("/v1/chat", {method: "POST", body: JSON.stringify({
      session_id: session, message, provider, allow_cloud: provider === "cloud",
    })});
    if ($("messages").querySelector(".welcome")) $("messages").replaceChildren();
    bubble("user", message); bubble("assistant", data.reply); $("message").value = "";
    status("Respuesta recibida y conversación guardada.");
    try { await sessions(); } catch { status("Respuesta guardada. No se pudo actualizar la lista.", true); }
  } catch (error) { showError(error); }
  finally { busy = false; controls(); $("message").focus(); }
});
$("delete-chat").addEventListener("click", async () => {
  if (busy || !connected || !confirm("¿Borrar el historial de esta conversación del servidor? Esta acción no se puede deshacer.")) return;
  busy = true; controls();
  try {
    await api(`/v1/sessions/${session}`, {method: "DELETE"});
    session = crypto.randomUUID(); $("consent").checked = false; $("message").value = "";
    emptyChat(); status("Conversación borrada."); await sessions();
  } catch (error) { showError(error); }
  finally { busy = false; controls(); }
});
