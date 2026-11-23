import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { SpeechSynthesis } from '@capgo/capacitor-speech-synthesis';

let partialListener = null;
let errorListener = null;
let listeningListener = null;
let transcript = '';

window.Capacitor = window.Capacitor || Capacitor;

window.StudyAINativeSpeech = {
  async available() {
    const result = await SpeechRecognition.available();
    return Boolean(result && result.available);
  },

  async start(language, onTranscript, onError, onState) {
    const availability = await SpeechRecognition.available();
    if (!availability || !availability.available) {
      throw new Error('خدمة التعرف على الكلام غير متاحة على هذا الجهاز.');
    }

    const permission = await SpeechRecognition.requestPermissions();
    if (permission && permission.speechRecognition === 'denied') {
      throw new Error('لم يتم منح إذن الميكروفون والتعرف على الكلام.');
    }

    transcript = '';
    if (partialListener) await partialListener.remove();
    if (errorListener) await errorListener.remove();

    partialListener = await SpeechRecognition.addListener('partialResults', event => {
      const current = event.accumulatedText || (event.matches && event.matches[0]) || '';
      if (current) {
        transcript = current;
        if (typeof onTranscript === 'function') onTranscript(current);
      }
    });

    errorListener = await SpeechRecognition.addListener('error', event => {
      if (typeof onError === 'function') {
        onError(new Error(event.message || event.error || 'تعذر التعرف على الكلام.'));
      }
    });

    listeningListener = await SpeechRecognition.addListener('listeningState', event => {
      if (typeof onState === 'function') onState(event);
    });

    await SpeechRecognition.start({
      language: language || 'ar-EG',
      partialResults: true,
      popup: false,
      maxResults: 3,
      contextualStrings: [
        'Food Microbiology', 'Food Safety', 'HACCP', 'Lactobacillus',
        'Bifidobacterium', 'Kjeldahl', 'Starch', 'Protein', 'Fermentation'
      ]
    });

    return true;
  },

  async stop() {
    try {
      await SpeechRecognition.stop();
    } finally {
      if (partialListener) {
        await partialListener.remove();
        partialListener = null;
      }
      if (errorListener) {
        await errorListener.remove();
        errorListener = null;
      }
      if (listeningListener) {
        await listeningListener.remove();
        listeningListener = null;
      }
    }
    return transcript;
  },

  async speak(text, language) {
    const lang = language || 'ar-EG';
    const availability = await SpeechSynthesis.isAvailable();
    if (!availability || !availability.available) {
      throw new Error('ميزة النطق غير متاحة على هذا الجهاز.');
    }
    let voices = [];
    try {
      const result = await SpeechSynthesis.getVoices();
      voices = result && Array.isArray(result.voices) ? result.voices : [];
    } catch (error) {
      voices = [];
    }
    const exact = voices.find(voice => (voice.language || '').toLowerCase() === lang.toLowerCase());
    const regional = voices.find(voice => (voice.language || '').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    const selected = exact || regional || null;
    await SpeechSynthesis.cancel();
    let utteranceId = null;
    let endHandle = null;
    let errorHandle = null;
    let finishResolve;
    let finishReject;
    const finished = new Promise((resolve, reject) => { finishResolve = resolve; finishReject = reject; });
    endHandle = await SpeechSynthesis.addListener('end', event => {
      if (!event.utteranceId || !utteranceId || event.utteranceId === utteranceId) finishResolve();
    });
    errorHandle = await SpeechSynthesis.addListener('error', event => {
      if (!event.utteranceId || !utteranceId || event.utteranceId === utteranceId) finishReject(new Error(event.error || 'تعذر تشغيل الصوت.'));
    });
    try {
      const result = await SpeechSynthesis.speak({
        text: String(text || ''),
        language: selected ? selected.language : lang,
        voiceId: selected ? selected.id : undefined,
        rate: 0.92,
        pitch: 1,
        volume: 1,
        queueStrategy: 'Flush'
      });
      utteranceId = result && result.utteranceId;
      await finished;
      return result;
    } finally {
      if (endHandle) await endHandle.remove();
      if (errorHandle) await errorHandle.remove();
    }
  },

  async stopSpeaking() {
    return SpeechSynthesis.cancel();
  }
};
