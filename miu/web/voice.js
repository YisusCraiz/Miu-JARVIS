"use strict";
// Inject browser APIs so speech lifecycle can be tested without a microphone or network.
class MiuVoice {
  constructor(env, callbacks) {
    this.env = env;
    this.callbacks = callbacks;
    this.recognition = null;
    this.speech = null;
    this.timer = null;
    this.listening = false;
  }
  get canListen() {
    return Boolean(this.env.isSecureContext &&
      (this.env.SpeechRecognition || this.env.webkitSpeechRecognition));
  }
  get canSpeak() {
    return Boolean(this.env.speechSynthesis && this.env.SpeechSynthesisUtterance);
  }
  voices() {
    return this.canSpeak ? this.env.speechSynthesis.getVoices().filter(v => v.localService) : [];
  }
  start(language) {
    if (!this.canListen || this.recognition) return false;
    this.stopSpeaking();
    const Recognition = this.env.SpeechRecognition || this.env.webkitSpeechRecognition;
    const recognition = new Recognition();
    this.recognition = recognition;
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    let received = false, failed = false;
    recognition.onresult = (event) => {
      if (this.recognition !== recognition) return;
      const parts = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) parts.push(event.results[i][0].transcript);
      }
      const text = parts.join(" ").trim();
      if (text) { received = true; this.callbacks.transcript(text); }
    };
    recognition.onerror = (event) => {
      if (this.recognition !== recognition) return;
      failed = true;
      const messages = {
        "not-allowed": "Permiso de micrófono denegado. Revísalo en el navegador.",
        "service-not-allowed": "El navegador no permite el servicio de dictado.",
        "audio-capture": "No se detectó un micrófono disponible.",
        "no-speech": "No se detectó voz. Puedes volver a intentarlo.",
        "network": "El servicio de dictado no está disponible. Puedes seguir escribiendo.",
        "language-not-supported": "Ese idioma no está disponible para dictado.",
      };
      this.callbacks.notice(messages[event.error] || "No se pudo completar el dictado.", true);
      this.cancelListening();
    };
    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      this.recognition = null; this.setListening(false);
      this.clearTimer();
      if (!received && !failed) this.callbacks.notice("Dictado terminado sin texto. Puedes volver a intentarlo.");
    };
    try {
      recognition.start(); this.setListening(true);
      this.timer = this.env.setTimeout(() => this.cancelListening(), 60000);
      return true;
    } catch {
      this.cancelListening();
      this.callbacks.notice("No se pudo iniciar el micrófono. Comprueba los permisos.", true);
      return false;
    }
  }
  setListening(value) {
    this.listening = value; this.callbacks.listening(value);
  }
  clearTimer() {
    if (this.timer !== null) this.env.clearTimeout(this.timer);
    this.timer = null;
  }
  finishListening() {
    if (!this.recognition) return;
    try { this.recognition.stop(); }
    catch { this.cancelListening(); }
  }
  cancelListening() {
    const recognition = this.recognition;
    this.recognition = null; this.clearTimer(); this.setListening(false);
    if (recognition) { try { recognition.abort(); } catch { /* Already stopped. */ } }
  }
  speak(text, voiceURI, rate = 1) {
    this.stopSpeaking();
    const voice = this.voices().find(v => v.voiceURI === voiceURI);
    if (!voice || this.listening || !text.trim()) return false;
    const utterance = new this.env.SpeechSynthesisUtterance(text.slice(0, 4000));
    utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = rate;
    this.speech = utterance;
    const done = () => {
      if (this.speech === utterance) { this.speech = null; this.callbacks.speaking(false); }
    };
    utterance.onend = done;
    utterance.onerror = () => {
      if (this.speech !== utterance) return;
      done(); this.callbacks.notice("No se pudo reproducir la voz. La respuesta sigue disponible en texto.", true);
    };
    try {
      this.env.speechSynthesis.speak(utterance); this.callbacks.speaking(true); return true;
    } catch { done(); return false; }
  }
  stopSpeaking() {
    this.speech = null;
    if (this.canSpeak) this.env.speechSynthesis.cancel();
    this.callbacks.speaking(false);
  }
  stop() { this.cancelListening(); this.stopSpeaking(); }
}
if (typeof module !== "undefined" && module.exports) module.exports = MiuVoice;
else window.MiuVoice = MiuVoice;
