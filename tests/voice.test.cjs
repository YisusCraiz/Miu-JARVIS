const {test} = require('node:test');
const assert = require('node:assert/strict');
const MiuVoice = require('../miu/web/voice.js');

function fixture() {
  const events = [], transcripts = [], notices = [];
  const local = {voiceURI: 'local-es', lang: 'es-MX', localService: true};
  const remote = {voiceURI: 'remote', lang: 'es-MX', localService: false};
  class Recognition {
    start() { this.started = true; }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; }
  }
  const env = {isSecureContext: true, SpeechRecognition: Recognition,
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    setTimeout(fn) { env.timeout = fn; return 1; }, clearTimeout() { env.cleared = true; },
    speechSynthesis: {getVoices: () => [remote, local], cancel() {},
      speak(u) { env.utterance = u; }}};
  const voice = new MiuVoice(env, {listening: v => events.push(v), speaking() {},
    transcript: t => transcripts.push(t), notice: (...n) => notices.push(n)});
  return {voice, env, events, transcripts, notices};
}
function result(r, text) {
  r.onresult({resultIndex: 0, results: [Object.assign([{transcript: text}], {isFinal: true})]});
}
test('dictation is one-shot and produces draft text only', () => {
  const {voice, transcripts} = fixture();
  assert.equal(voice.start('es-MX'), true);
  const r = voice.recognition;
  assert.equal(r.lang, 'es-MX'); assert.equal(r.continuous, false);
  result(r, 'Hola Miu'); assert.deepEqual(transcripts, ['Hola Miu']);
  voice.finishListening(); assert.equal(r.stopped, true);
  r.onend(); assert.equal(voice.listening, false);
});
test('aborted session ignores late results and end callbacks', () => {
  const {voice, transcripts} = fixture(); voice.start('es-MX');
  const old = voice.recognition; voice.cancelListening(); voice.start('en-US');
  result(old, 'stale text'); old.onend();
  assert.deepEqual(transcripts, []); assert.equal(voice.listening, true);
});
test('permission failures release microphone state and display useful error', () => {
  const {voice, notices} = fixture(); voice.start('es-MX');
  const r = voice.recognition; r.onerror({error: 'not-allowed'});
  assert.equal(voice.listening, false); assert.equal(r.aborted, true);
  assert.match(notices[0][0], /denegado/);
});
test('microphone has bounded lifetime', () => {
  const {voice, env} = fixture(); voice.start('es-MX');
  const r = voice.recognition; env.timeout();
  assert.equal(r.aborted, true); assert.equal(voice.listening, false);
});
test('unsupported browser does not start recognition', () => {
  const {voice, env} = fixture(); env.isSecureContext = false;
  assert.equal(voice.canListen, false); assert.equal(voice.start('es-MX'), false);
});
test('only explicitly local voices can receive response text', () => {
  const {voice, env} = fixture();
  assert.equal(voice.voices().length, 1);
  assert.equal(voice.speak('private response', 'remote'), false);
  assert.equal(env.utterance, undefined);
  assert.equal(voice.speak('Hola', 'local-es', 0.8), true);
  assert.equal(env.utterance.voice.voiceURI, 'local-es');
  assert.equal(env.utterance.rate, 0.8);
});
test('starting microphone cancels playback and stop cancels both', () => {
  const {voice, env} = fixture(); let cancels = 0;
  env.speechSynthesis.cancel = () => cancels++;
  voice.speak('Hola', 'local-es'); voice.start('es-MX');
  assert.equal(voice.speech, null);
  assert.equal(voice.speak('Not while recording', 'local-es'), false);
  voice.stop(); assert.equal(voice.listening, false); assert.ok(cancels >= 3);
});
test('playback bounds long responses and ignores stale completion', () => {
  const {voice, env} = fixture(); voice.speak('x'.repeat(5000), 'local-es');
  const old = env.utterance; assert.equal(old.text.length, 4000);
  voice.speak('new', 'local-es'); old.onend();
  assert.equal(voice.speech.text, 'new'); env.utterance.onend();
  assert.equal(voice.speech, null);
});
