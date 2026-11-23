import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';

let partialListener = null;
let errorListener = null;
let transcript = '';

window.Capacitor = window.Capacitor || Capacitor;

window.StudyAINativeSpeech = {
  async available() {
    const result = await SpeechRecognition.available();
    return Boolean(result && result.available);
  },

  async start(language, onTranscript, onError) {
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
    }
    return transcript;
  }
};
