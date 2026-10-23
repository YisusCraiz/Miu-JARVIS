"use strict";
const $ = (id) => document.getElementById(id);
let token = "", session = crypto.randomUUID(), busy = false, connected = false;
let settings = null;
let lastReply = "";
const voice = new window.MiuVoice(window, {
  transcript(text) {
    const draft = $("message").value;
    $("message").value = (draft + (draft.trim() ? " " : "") + text).slice(0, 8000);
    $("consent").checked = false;
    status("Transcripción lista. Revisa el texto y pulsa Enviar cuando quieras.");
  },
  notice: (text, error) => status(text, error),
  listening(active) {
    $("dictate").textContent = active ? "Terminar dictado" : "Hablar";
    $("dictate").setAttribute("aria-pressed", String(active));
    $("voice-status").textContent = active ? "Micrófono activo · máximo 60 segundos" : "Micrófono inactivo";
    controls();
  },
  speaking(active) { $("stop-speech").disabled = !active; },
});
function refreshVoices() {
  const old = $("speech-voice").value;
  $("speech-voice").replaceChildren();
  for (const v of voice.voices()) {
    const option = document.createElement("option");
    option.value = v.voiceURI; option.textContent = `${v.name} (${v.lang})`;
    $("speech-voice").append(option);
  }
  const values = [...$("speech-voice").options].map(o => o.value);
  if (values.includes(old)) $("speech-voice").value = old;
  else {
    const spanish = voice.voices().find(v => v.lang.startsWith("es"));
    if (spanish) $("speech-voice").value = spanish.voiceURI;
  }
  if (!values.length) {
    const option = document.createElement("option"); option.value = "";
    option.textContent = "Sin voces locales disponibles"; $("speech-voice").append(option);
    $("read-aloud").checked = false;
  }
  $("read-aloud").disabled = !values.length;
  $("voice-capabilities").textContent = (voice.canListen ?
    "Dictado disponible; requiere permiso del micrófono." : "Dictado no disponible en este navegador o conexión. Puedes escribir.") +
    " Solo se ofrecen voces que el navegador identifica como locales. Micrófono y salida se eligen en el navegador o sistema.";
  controls();
}
function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
function controls() {
  const recording = voice.listening;
  for (const id of ["message", "send", "provider", "new-chat", "delete-chat"]) {
    $(id).disabled = !connected || busy || recording;
  }
  $("dictate").disabled = !connected || busy || !voice.canListen || !$("dictation-consent").checked;
  $("speech-language").disabled = recording;
  $("read-last").disabled = !connected || busy || recording || !lastReply || !$("speech-voice").value;
  $("disconnect").disabled = busy;
  for (const b of document.querySelectorAll("#sessions button, .suggestions button")) {
    b.disabled = !connected || busy || recording;
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
  if (busy || voice.listening) return;
  voice.stop(); lastReply = "";
  busy = true; controls();
  try {
    const data = await api(`/v1/sessions/${encodeURIComponent(id)}`);
    session = id; $("messages").replaceChildren();
    for (const m of data.messages) {
      bubble(m.role, m.content);
      if (m.role === "assistant") lastReply = m.content;
    }
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
  voice.stop(); lastReply = ""; $("read-aloud").checked = false;
  $("dictation-consent").checked = false;
  token = ""; settings = null; connected = false; session = crypto.randomUUID();
  $("message").value = ""; $("provider").value = "ollama";
  $("connection").hidden = false; $("disconnect").hidden = true;
  $("sessions").replaceChildren(); emptyChat(); updateProvider();
  status("Desconectado. El historial permanece en tu servidor.");
});
$("new-chat").addEventListener("click", () => {
  voice.stop(); lastReply = "";
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
  event.preventDefault(); if (busy || !connected || voice.listening) return;
  const message = $("message").value.trim(), provider = $("provider").value;
  if (!message) return;
  if (provider === "cloud" && !$("consent").checked) {
    status("Marca la autorización para enviar esta pregunta y su contexto a la nube.", true); return;
  }
  voice.stopSpeaking();
  busy = true; controls(); status("Miu está pensando…");
  $("consent").checked = false;
  try {
    const data = await api("/v1/chat", {method: "POST", body: JSON.stringify({
      session_id: session, message, provider, allow_cloud: provider === "cloud",
    })});
    if ($("messages").querySelector(".welcome")) $("messages").replaceChildren();
    bubble("user", message); bubble("assistant", data.reply); $("message").value = "";
    lastReply = data.reply;
    status("Respuesta recibida y conversación guardada.");
    if ($("read-aloud").checked && !document.hidden) speakLast();
    try { await sessions(); } catch { status("Respuesta guardada. No se pudo actualizar la lista.", true); }
  } catch (error) { showError(error); }
  finally { busy = false; controls(); $("message").focus(); }
});
$("delete-chat").addEventListener("click", async () => {
  if (busy || !connected || !confirm("¿Borrar el historial de esta conversación del servidor? Esta acción no se puede deshacer.")) return;
  busy = true; controls();
  try {
    voice.stop(); lastReply = "";
    await api(`/v1/sessions/${session}`, {method: "DELETE"});
    session = crypto.randomUUID(); $("consent").checked = false; $("message").value = "";
    emptyChat(); status("Conversación borrada."); await sessions();
  } catch (error) { showError(error); }
  finally { busy = false; controls(); }
});

function speakLast() {
  if (!voice.speak(lastReply, $("speech-voice").value, Number($("speech-rate").value))) {
    status("No hay una voz local disponible. Puedes leer la respuesta en pantalla.", true);
  } else if (lastReply.length > 4000) {
    status("Se leerán los primeros 4000 caracteres; el texto completo está en el chat.");
  }
}
$("dictate").addEventListener("click", () => {
  if (!connected || busy || !$("dictation-consent").checked) return;
  if (voice.listening) voice.finishListening();
  else voice.start($("speech-language").value);
});
$("dictation-consent").addEventListener("change", () => {
  if (!$("dictation-consent").checked) voice.cancelListening();
  controls();
});
$("read-last").addEventListener("click", speakLast);
$("stop-speech").addEventListener("click", () => voice.stopSpeaking());
$("read-aloud").addEventListener("change", () => {
  if (!$("read-aloud").checked) voice.stopSpeaking();
});
$("speech-voice").addEventListener("change", () => { voice.stopSpeaking(); controls(); });
window.addEventListener("pagehide", () => voice.stop());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) voice.stop();
});
if (voice.canSpeak) window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
refreshVoices();
