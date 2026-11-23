/* StudyAI V2.1 — long-lecture processing, page-aware sources, PPTX, and safer rendering */
(function () {
  'use strict';
  const $ = function (id) { return document.getElementById(id); };
  const CHUNK_SIZE = 16000;
  const conversation = [];

  function sourceText() { return $('txt').value.trim(); }

  function sourceChunks(text, maxSize) {
    const max = maxSize || CHUNK_SIZE;
    const lines = text.split(/\r?\n/);
    const chunks = [];
    let current = '';
    let activeMarker = '';

    function prefix() { return activeMarker ? activeMarker + '\n' : ''; }
    function pushCurrent() {
      const value = current.trim();
      if (value) chunks.push(value);
      current = '';
    }

    for (const line of lines) {
      const marker = line.trim().match(/^\[(PAGE|SLIDE):(\d+)\]$/);
      if (marker) {
        pushCurrent();
        activeMarker = '[' + marker[1] + ':' + marker[2] + ']';
        current = prefix();
        continue;
      }

      const available = Math.max(1000, max - prefix().length);
      if (line.length > available) {
        pushCurrent();
        let offset = 0;
        while (offset < line.length) {
          const piece = line.slice(offset, offset + available);
          offset += available;
          if (offset < line.length) chunks.push((prefix() + piece).trim());
          else current = prefix() + piece;
        }
        continue;
      }

      if (current.length + line.length + 1 > max) pushCurrent();
      if (!current) current = prefix();
      current += (current.endsWith('\n') || !current ? '' : '\n') + line;
    }
    pushCurrent();
    return chunks;
  }
  function sourceLabel(text) {
    const found = [];
    const re = /\[(?:PAGE|SLIDE):(\d+)\]/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const n = Number(match[1]);
      if (!found.includes(n)) found.push(n);
    }
    if (!found.length) return 'لا تتوفر أرقام صفحات دقيقة لهذا الجزء';
    found.sort(function (a, b) { return a - b; });
    if (found.length === 1) return 'الصفحة ' + found[0];
    return 'الصفحات ' + found[0] + '–' + found[found.length - 1];
  }

  function cleanJson(raw) {
    let value = String(raw || '').trim();
    const fence = String.fromCharCode(96).repeat(3);
    value = value.replace(new RegExp('^' + fence + '(?:json)?\\s*', 'i'), '');
    value = value.replace(new RegExp('\\s*' + fence + '$'), '');
    const first = value.indexOf('{');
    const last = value.lastIndexOf('}');
    if (first >= 0 && last > first) value = value.slice(first, last + 1);
    return JSON.parse(value);
  }

  function runTask(button, output, work) {
    if (button) button.disabled = true;
    output.textContent = '⏳ جاري المعالجة...';
    Promise.resolve().then(work).catch(function (error) {
      output.textContent = '❌ ' + (error && error.message ? error.message : String(error));
    }).finally(function () {
      if (button) button.disabled = false;
    });
  }

  async function extractNotesForAll(text, statusNode, purpose) {
    const chunks = sourceChunks(text, CHUNK_SIZE);
    if (!chunks.length) throw new Error('لم أجد نصًا قابلًا للمعالجة في المحاضرة.');
    const notes = [];
    for (let i = 0; i < chunks.length; i++) {
      const label = sourceLabel(chunks[i]);
      if (statusNode) statusNode.textContent = 'تحليل الجزء ' + (i + 1) + ' من ' + chunks.length + ' — ' + label;
      const prompt =
        'حلّل الجزء التالي من محاضرة جامعية لاستخدامه في ' + purpose + '.\n' +
        'استخرج المعلومات المهمة بدقة: التعريفات، المصطلحات، التصنيفات، الخصائص، الخطوات، الأرقام، الشروط، الاستثناءات، المقارنات، الأمثلة، والعلاقات بين الأفكار.\n' +
        'لا تخترع معلومة ولا تسقط تفصيلة علمية ظاهرة في النص. رتّب النقاط حسب ظهورها، واحتفظ بالمصطلحات الإنجليزية كما هي. ضع مرجع الصفحة بجوار المعلومة عندما يظهر [PAGE:n] أو [SLIDE:n]. إذا كان النص غير واضح فاذكر ذلك بدل التخمين.\n\n' +
        'مصدر هذا الجزء: ' + label + '\n' + chunks[i];
      const result = await ai([
        { role: 'system', content: 'أنت محلل محاضرات جامعية دقيق. اعتمد فقط على النص المرفق، ولا تضف معلومات خارجية.' },
        { role: 'user', content: prompt }
      ]);
      notes.push('[' + label + ']\n' + result);
    }
    return notes;
  }

  window.src = sourceText;
  window.run = runTask;

  window.organize = function (button) {
    const text = sourceText();
    if (!text) { alert('ارفع ملفًا أو الصق نص المحاضرة أولًا.'); return; }
    const output = $('orgOut');
    const mode = $('orgMode').value;
    runTask(button, output, async function () {
      const chunks = sourceChunks(text, CHUNK_SIZE);
      const results = [];
      for (let i = 0; i < chunks.length; i++) {
        const label = sourceLabel(chunks[i]);
        output.textContent = 'معالجة الجزء ' + (i + 1) + ' من ' + chunks.length + ' — ' + label + '\n\n' + results.join('\n\n');
        const prompt =
          'نظّم هذا الجزء من محاضرة جامعية بالشكل التالي: ' + mode + '.\n' +
          'تعليمات إلزامية:\n' +
          '1) حافظ على ترتيب الأفكار كما وردت في المصدر.\n' +
          '2) لا تحذف التعريفات أو الشروط أو الأرقام أو الأمثلة أو الاستثناءات أو المقارنات.\n' +
          '3) عندما تكون المادة بالإنجليزية، اكتب كل نقطة بالإنجليزية أولًا ثم ترجمتها العربية مباشرة تحتها.\n' +
          '4) أبقِ المصطلحات العلمية الإنجليزية واضحة.\n' +
          '5) ميّز أي شرح إضافي غير موجود في المصدر بعبارة "توضيح إضافي"، ولا تخلطه بمحتوى المحاضرة.\n' +
          '6) اكتب رقم الصفحة بجوار النقطة متى كان متاحًا، ولا تخمّن أرقام الصفحات.\n' +
          '7) إذا كان جزء من النص غير واضح، أشر إليه ولا تستنتج محتواه.\n\n' +
          'هذا الجزء ' + (i + 1) + ' من ' + chunks.length + ' — ' + label + '\n' + chunks[i];
        const result = await ai([
          { role: 'system', content: 'أنت مدرس جامعي ومنسق مذكرات دقيق. لا تختصر اختصارًا يضيّع التفاصيل.' },
          { role: 'user', content: prompt }
        ]);
        results.push('========== الجزء ' + (i + 1) + ' — ' + label + ' ==========\n' + result);
        output.textContent = results.join('\n\n');
      }
      await saveStudyArtifact('summary', mode, results.join('\n\n'), { sourceTitle: activeMaterialTitle });
      await window.refreshLibrary();
    });
  };

  window.makeQuiz = function (button) {
    const text = sourceText();
    if (!text) { alert('ارفع ملفًا أو الصق نص المحاضرة أولًا.'); return; }
    const output = $('quizOut');
    const requested = Math.max(3, Math.min(40, Number($('qn').value) || 10));
    runTask(button, output, async function () {
      const notes = await extractNotesForAll(text, output, 'إعداد اختبار يغطي المحاضرة');
      output.textContent = 'تم تحليل جميع الأجزاء. جارٍ إعداد ' + requested + ' سؤالًا...';
      const prompt =
        'أنشئ اختبارًا من ' + requested + ' سؤالًا اعتمادًا على الملاحظات المجمعة التالية، مع توزيع الأسئلة على جميع أجزاء المحاضرة قدر الإمكان.\n' +
        'نوّع بين mcq و tf و fill و essay. اجعل الأسئلة دقيقة وغير مكررة، ولا تضع معلومة غير موجودة في الملاحظات. أضف مصدر كل سؤال (رقم الصفحة أو الشريحة إن توفر).\n' +
        'أعد JSON صالحًا فقط بهذا الشكل:\n' +
        '{"questions":[{"type":"mcq","q":"السؤال","options":["أ","ب","ج","د"],"answer":0,"explain":"سبب الإجابة","source":"الصفحة 2"},{"type":"tf","q":"العبارة","answer":true,"explain":"التفسير","source":"الصفحة 3"},{"type":"fill","q":"أكمل: ...","answer":"الإجابة","explain":"التفسير","source":"الصفحة 4"},{"type":"essay","q":"السؤال","answer":"إجابة نموذجية","source":"الصفحة 5"}]}\n' +
        'في mcq يجب أن يكون answer رقم الاختيار من صفر إلى ثلاثة. وفي tf يجب أن يكون answer قيمة true أو false.\n\n' +
        notes.join('\n\n');
      const raw = await ai([
        { role: 'system', content: 'أنت واضع امتحانات جامعية. أخرج JSON فقط دون Markdown أو مقدمة.' },
        { role: 'user', content: prompt }
      ]);
      const data = cleanJson(raw);
      const questions = Array.isArray(data.questions) ? data.questions : [];
      if (!questions.length) throw new Error('لم يتم إنشاء أسئلة صالحة. أعد المحاولة.');
      renderQuiz(output, questions);
    });
  };

  function appendText(parent, tag, value, className) {
    const node = document.createElement(tag);
    node.textContent = value == null ? '' : String(value);
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  }

  function renderQuiz(output, questions) {
    output.textContent = '';
    const score = appendText(output, 'div', 'النتيجة: 0 — أجب عن الأسئلة لاحتساب نتيجتك');
    score.style.fontWeight = '700';
    const list = document.createElement('div');
    output.appendChild(list);
    let correct = 0;
    let answered = 0;

    questions.forEach(function (question, index) {
      const card = document.createElement('div');
      card.className = 'q';
      appendText(card, 'b', (index + 1) + ') ' + (question.q || 'سؤال بدون نص'));
      if (question.source) appendText(card, 'small', 'المصدر: ' + question.source);

      function reveal(ok, answerText) {
        if (card.dataset.done) return;
        card.dataset.done = '1';
        answered++;
        if (ok) correct++;
        score.textContent = 'النتيجة: ' + correct + ' من ' + answered + ' — إجمالي الأسئلة: ' + questions.length;
        if (answerText) appendText(card, 'div', answerText, 'out');
        if (question.explain) appendText(card, 'small', 'التفسير: ' + question.explain);
      }

      if (question.type === 'mcq' || question.type === 'tf') {
        const options = question.type === 'tf' ? ['صح', 'خطأ'] : (Array.isArray(question.options) ? question.options : []);
        const answerIndex = question.type === 'tf' ? (question.answer === true ? 0 : 1) : Number(question.answer);
        options.forEach(function (option, optionIndex) {
          const choice = document.createElement('button');
          choice.className = 'opt';
          choice.textContent = String(option);
          choice.onclick = function () {
            if (card.dataset.done) return;
            const isCorrect = optionIndex === answerIndex;
            choice.classList.add(isCorrect ? 'ok' : 'no');
            const buttons = card.querySelectorAll('.opt');
            if (buttons[answerIndex]) buttons[answerIndex].classList.add('ok');
            reveal(isCorrect, isCorrect ? 'إجابة صحيحة' : 'الإجابة الصحيحة: ' + options[answerIndex]);
            buttons.forEach(function (item) { item.disabled = true; });
          };
          card.appendChild(choice);
        });
      } else {
        const answerButton = document.createElement('button');
        answerButton.className = 'b';
        answerButton.textContent = 'أظهر الإجابة النموذجية';
        answerButton.onclick = function () {
          answerButton.disabled = true;
          reveal(false, 'الإجابة النموذجية: ' + (question.answer || 'لا توجد إجابة مرفقة'));
        };
        card.appendChild(answerButton);
      }
      list.appendChild(card);
    });
  }

  window.makeVideo = function (button) {
    const text = sourceText();
    if (!text) { alert('ارفع ملفًا أو الصق نص المحاضرة أولًا.'); return; }
    const output = $('vidOut');
    const requested = Math.max(3, Math.min(15, Number($('vn').value) || 6));
    runTask(button, output, async function () {
      const notes = await extractNotesForAll(text, output, 'إعداد شرح تعليمي مرئي');
      output.textContent = 'تم تحليل المحاضرة. جارٍ إنشاء الشرائح...';
      const prompt =
        'حوّل الملاحظات التالية إلى عرض شرح تعليمي من ' + requested + ' شرائح بالضبط.\n' +
        'كل شريحة تحتوي title و bullets (من 2 إلى 5 نقاط) و narration (شرح صوتي واضح وموسع نسبيًا). حافظ على ترتيب المحاضرة وأضف مصدر الصفحة في نهاية كل نقطة متى كان متاحًا. لا تضف معلومات خارج الملاحظات.\n' +
        'أخرج JSON فقط بهذا الشكل: {"slides":[{"title":"عنوان","bullets":["نقطة"],"narration":"الشرح","source":"الصفحات 1–2"}]}\n\n' +
        notes.join('\n\n');
      const raw = await ai([
        { role: 'system', content: 'أنت معدّ دروس تعليمية. أخرج JSON صالحًا فقط.' },
        { role: 'user', content: prompt }
      ]);
      const data = cleanJson(raw);
      if (!Array.isArray(data.slides) || !data.slides.length) throw new Error('لم يتم إنشاء شرائح صالحة.');
      renderSlides(output, data.slides);
    });
  };

  function renderSlides(output, deck) {
    let index = 0;
    output.textContent = '';
    const slide = document.createElement('div');
    slide.className = 'slide';
    const controls = document.createElement('div');
    const previous = appendText(controls, 'button', 'السابق', 'b');
    const next = appendText(controls, 'button', 'التالي', 'b');
    const read = appendText(controls, 'button', '🔊 اقرأ الشريحة', 'b');
    const stop = appendText(controls, 'button', 'إيقاف الصوت', 'b');
    const counter = appendText(output, 'small', '');
    output.appendChild(slide);
    output.appendChild(controls);

    function draw() {
      const item = deck[index];
      slide.textContent = '';
      appendText(slide, 'h2', item.title || 'شرح المحاضرة');
      const ul = document.createElement('ul');
      (Array.isArray(item.bullets) ? item.bullets : []).forEach(function (bullet) {
        appendText(ul, 'li', bullet);
      });
      slide.appendChild(ul);
      if (item.source) appendText(slide, 'small', 'المصدر: ' + item.source);
      counter.textContent = 'الشريحة ' + (index + 1) + ' من ' + deck.length;
      previous.disabled = index === 0;
      next.disabled = index === deck.length - 1;
    }
    previous.onclick = function () { index = Math.max(0, index - 1); draw(); };
    next.onclick = function () { index = Math.min(deck.length - 1, index + 1); draw(); };
    read.onclick = function () {
      if (!('speechSynthesis' in window)) { alert('ميزة القراءة الصوتية غير مدعومة في هذا المتصفح.'); return; }
      window.speechSynthesis.cancel();
      const item = deck[index];
      const speech = new SpeechSynthesisUtterance((item.title || '') + '. ' + (item.bullets || []).join('. ') + '. ' + (item.narration || ''));
      speech.lang = 'ar-SA';
      window.speechSynthesis.speak(speech);
    };
    stop.onclick = function () { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
    draw();
  }

  function retrieveContext(query, text) {
    const chunks = sourceChunks(text, 9000);
    const terms = (query.toLowerCase().match(/[\u0600-\u06ffA-Za-z0-9]+/g) || [])
      .filter(function (term) { return term.length > 2; });
    const ranked = chunks.map(function (chunk, index) {
      const normalized = chunk.toLowerCase();
      let score = 0;
      terms.forEach(function (term) { if (normalized.includes(term)) score += 1; });
      return { chunk: chunk, index: index, score: score };
    });
    ranked.sort(function (a, b) { return b.score - a.score || a.index - b.index; });
    const chosen = ranked.slice(0, Math.min(4, ranked.length)).sort(function (a, b) { return a.index - b.index; });
    return chosen.map(function (item) {
      return '[' + sourceLabel(item.chunk) + ']\n' + item.chunk;
    }).join('\n\n---\n\n');
  }

  window.chat = async function (question) {
    const text = sourceText();
    if (!question || !question.trim()) return;
    if (typeof add === 'function') add('me', question);
    else appendText($('chat'), 'div', question, 'msg me');
    conversation.push({ role: 'user', content: question });
    try {
      const context = text ? retrieveContext(question, text) : '';
      const system =
        'أنت مدرس جامعي ومساعد مذاكرة. أجب بالعربية المبسطة مع إبقاء المصطلحات العلمية الإنجليزية. ' +
        'عند الاعتماد على المحاضرة، استشهد برقم الصفحة أو الشريحة الظاهر في النص مثل [صفحة 4]. ' +
        'لا تدّعِ أن معلومة موجودة في المحاضرة إذا لم تظهر في المقاطع المسترجعة. إذا لم تجد الإجابة فقل ذلك بوضوح وميّز أي معرفة خارجية عن محتوى المحاضرة.' +
        (context ? '\nمقاطع ذات صلة من محاضرة الطالب:\n' + context : '\nلم يرفع الطالب محاضرة بعد؛ أجب من معرفتك العامة مع توضيح ذلك.');
      const messages = [{ role: 'system', content: system }].concat(conversation.slice(-10));
      const answer = await ai(messages);
      conversation.push({ role: 'assistant', content: answer });
      if (typeof add === 'function') add('ai', answer);
      else appendText($('chat'), 'div', answer, 'msg ai');
      if (typeof say === 'function') say(answer.replace(/[*#_]/g, ''));
    } catch (error) {
      const message = 'تعذر الحصول على إجابة: ' + (error.message || String(error));
      if (typeof add === 'function') add('ai', message);
      else appendText($('chat'), 'div', message, 'msg ai');
    }
  };

  $('fi').accept = '.pdf,.docx,.txt,.md,.pptx';
  $('fi').onchange = async function (event) {
    activeMaterialId = null;
    activeMaterialTitle = Array.from(event.target.files || []).map(function (file) { return file.name; }).join('، ') || 'محاضرة جديدة';
    if ($('saveMaterial')) $('saveMaterial').textContent = 'حفظ المحاضرة في مكتبتي';
    let all = $('txt').value;
    const notices = [];
    $('info').textContent = 'جاري قراءة الملفات...';
    for (const file of event.target.files) {
      try {
        const name = file.name.toLowerCase();
        let extracted = '';
        if (name.endsWith('.pdf')) {
          if (!window.pdfjsLib) throw new Error('مكتبة قراءة PDF لم تُحمّل.');
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
          let imagePages = 0;
          for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
            const page = await pdf.getPage(pageNo);
            const pageContent = await page.getTextContent();
            const pageText = pageContent.items.map(function (item) { return item.str; }).join(' ').trim();
            extracted += '\n[PAGE:' + pageNo + ']\n';
            if (pageText) extracted += pageText + '\n';
            else {
              imagePages++;
              if ($('enableOcr') && $('enableOcr').checked) {
                try {
                  const recognized = await recognizePdfPage(page, pageNo, $('info'));
                  if (recognized) extracted += '[OCR عربي + English]\n' + recognized + '\n';
                  else extracted += '[تعذر التعرف على النص في هذه الصفحة؛ راجع الصورة يدويًا]\n';
                } catch (ocrError) {
                  extracted += '[فشل OCR في الصفحة ' + pageNo + ': ' + (ocrError.message || 'خطأ غير معروف') + ']\n';
                  notices.push(file.name + ': فشل OCR في الصفحة ' + pageNo);
                }
              } else {
                extracted += '[صفحة مصوّرة؛ OCR غير مفعّل]\n';
              }
            }
          }
          if (imagePages) notices.push(file.name + ': ' + imagePages + ' صفحة قد تحتاج OCR');
        } else if (name.endsWith('.docx')) {
          if (!window.mammoth) throw new Error('مكتبة قراءة Word لم تُحمّل.');
          const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
          extracted = '\n[DOCX: ' + file.name + ' — أرقام الصفحات الأصلية غير متاحة في استخراج النص]\n' + result.value;
        } else if (name.endsWith('.pptx')) {
          if (!window.JSZip) throw new Error('مكتبة قراءة PowerPoint لم تُحمّل.');
          const zip = await JSZip.loadAsync(await file.arrayBuffer());
          const slideNames = Object.keys(zip.files).filter(function (path) {
            return /^ppt\/slides\/slide\d+\.xml$/.test(path);
          }).sort(function (a, b) {
            return Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]);
          });
          for (const path of slideNames) {
            const slideNo = Number(path.match(/slide(\d+)/)[1]);
            const xml = await zip.files[path].async('string');
            const doc = new DOMParser().parseFromString(xml, 'application/xml');
            const texts = Array.from(doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 't'))
              .map(function (node) { return node.textContent; }).filter(Boolean);
            extracted += '\n[SLIDE:' + slideNo + ']\n' + texts.join(' ') + '\n';
          }
        } else {
          extracted = '\n[FILE: ' + file.name + ' — لا توجد أرقام صفحات]\n' + await file.text();
        }
        all += '\n\n--- FILE: ' + file.name + ' ---\n' + extracted;
      } catch (error) {
        all += '\n\n[تعذرت قراءة ' + file.name + ': ' + (error.message || String(error)) + ']';
      }
    }
    $('txt').value = all.trim();
    if (typeof saveMaterialRecord === 'function' && $('txt').value) {
      try { await saveMaterialRecord($('txt').value, Array.from(event.target.files).map(function (file) { return file.name; }).join('، ') || 'محاضرة ملصوقة'); } catch (storageError) { notices.push('تعذر الحفظ المحلي: ' + storageError.message); }
    }
    const total = $('txt').value.length;
    $('info').textContent = 'تم استخراج ' + total.toLocaleString('en-US') + ' حرف من الملفات المحددة. ' +
      (notices.length ? 'تنبيه: ' + notices.join('؛ ') + '. ' : '') +
      'ستتم معالجة المحاضرة على أجزاء متتابعة بدل الاقتصار على أول جزء منها.';
  };
  function allocateChunkWork(chunks, totalWork) {
    const count = chunks.length;
    if (count > totalWork) {
      const indexes = [];
      if (totalWork === 1) indexes.push(Math.floor((count - 1) / 2));
      else {
        for (let i = 0; i < totalWork; i++) {
          indexes.push(Math.floor(i * (count - 1) / (totalWork - 1)));
        }
      }
      return indexes.map(function (index) { return { index: index, amount: 1 }; });
    }

    const allocations = chunks.map(function (chunk, index) {
      return { index: index, amount: 1, remainder: 0 };
    });
    let remaining = totalWork - count;
    if (!remaining) return allocations;

    const totalLength = chunks.reduce(function (sum, chunk) { return sum + chunk.length; }, 0);
    let assigned = 0;
    allocations.forEach(function (item) {
      const exact = remaining * chunks[item.index].length / Math.max(1, totalLength);
      const whole = Math.floor(exact);
      item.amount += whole;
      item.remainder = exact - whole;
      assigned += whole;
    });
    let left = remaining - assigned;
    allocations.slice().sort(function (a, b) {
      return b.remainder - a.remainder || a.index - b.index;
    }).slice(0, left).forEach(function (item) {
      allocations[item.index].amount += 1;
    });
    return allocations;
  }

  window.makeQuiz = function (button) {
    const text = sourceText();
    if (!text) { alert('ارفع ملفًا أو الصق نص المحاضرة أولًا.'); return; }
    const output = $('quizOut');
    const requested = Math.max(3, Math.min(40, Number($('qn').value) || 10));
    runTask(button, output, async function () {
      const chunks = sourceChunks(text, CHUNK_SIZE);
      if (!chunks.length) throw new Error('لم يتم العثور على نص قابل للقراءة.');
      const plan = allocateChunkWork(chunks, requested);
      const allQuestions = [];
      for (let i = 0; i < plan.length; i++) {
        const item = plan[i];
        const label = sourceLabel(chunks[item.index]);
        output.textContent = 'إنشاء الأسئلة من الجزء ' + (item.index + 1) + ' من ' + chunks.length +
          ' — ' + label + ' (' + (i + 1) + '/' + plan.length + ')';
        const prompt =
          'أنشئ ' + item.amount + ' سؤالًا جامعيًا من الجزء التالي فقط. نوّع قدر الإمكان بين mcq و tf و fill و essay. ' +
          'لا تختبر معلومة غير موجودة في هذا الجزء. أرفق مصدر السؤال بصيغة واضحة مثل ' + label + '. ' +
          'أعد JSON صالحًا فقط: {"questions":[{"type":"mcq","q":"السؤال","options":["أ","ب","ج","د"],"answer":0,"explain":"التفسير","source":"' + label + '"},' +
          '{"type":"tf","q":"العبارة","answer":true,"explain":"التفسير","source":"' + label + '"},' +
          '{"type":"fill","q":"أكمل: ...","answer":"الإجابة","explain":"التفسير","source":"' + label + '"},' +
          '{"type":"essay","q":"السؤال","answer":"إجابة نموذجية","source":"' + label + '"}]}.\n\n' +
          'نص المحاضرة:\n' + chunks[item.index];
        const raw = await ai([
          { role: 'system', content: 'أنت واضع امتحانات جامعية. اعتمد فقط على النص، وأخرج JSON صالحًا دون Markdown.' },
          { role: 'user', content: prompt }
        ]);
        const data = cleanJson(raw);
        const questions = Array.isArray(data.questions) ? data.questions : [];
        questions.slice(0, item.amount).forEach(function (question) {
          question.source = question.source || label;
          allQuestions.push(question);
        });
      }
      if (!allQuestions.length) throw new Error('لم يتم إنشاء أسئلة صالحة. أعد المحاولة.');
      renderQuiz(output, allQuestions);
    });
  };

  window.makeVideo = function (button) {
    const text = sourceText();
    if (!text) { alert('ارفع ملفًا أو الصق نص المحاضرة أولًا.'); return; }
    const output = $('vidOut');
    const requested = Math.max(3, Math.min(15, Number($('vn').value) || 6));
    runTask(button, output, async function () {
      const chunks = sourceChunks(text, CHUNK_SIZE);
      if (!chunks.length) throw new Error('لم يتم العثور على نص قابل للقراءة.');
      const plan = allocateChunkWork(chunks, requested);
      const slides = [];
      for (let i = 0; i < plan.length; i++) {
        const item = plan[i];
        const label = sourceLabel(chunks[item.index]);
        output.textContent = 'إعداد شرائح الجزء ' + (item.index + 1) + ' من ' + chunks.length +
          ' — ' + label + ' (' + (i + 1) + '/' + plan.length + ')';
        const prompt =
          'أنشئ ' + item.amount + ' شرائح شرح لهذا الجزء من محاضرة جامعية فقط. حافظ على ترتيب المادة، واكتب نقاطًا مفهومة مع شرح صوتي واضح، ولا تضف معلومة خارج النص. ' +
          'أرفق مصدر الشريحة: ' + label + '. أخرج JSON صالحًا فقط: ' +
          '{"slides":[{"title":"عنوان","bullets":["نقطة 1","نقطة 2"],"narration":"شرح المدرس","source":"' + label + '"}]}\n\n' +
          'نص المحاضرة:\n' + chunks[item.index];
        const raw = await ai([
          { role: 'system', content: 'أنت معدّ دروس تعليمية. اعتمد فقط على المصدر وأخرج JSON صالحًا دون Markdown.' },
          { role: 'user', content: prompt }
        ]);
        const data = cleanJson(raw);
        const partSlides = Array.isArray(data.slides) ? data.slides : [];
        partSlides.slice(0, item.amount).forEach(function (slide) {
          slide.source = slide.source || label;
          slides.push(slide);
        });
      }
      if (!slides.length) throw new Error('لم يتم إنشاء شرائح صالحة.');
      renderSlides(output, slides);
    });
  };

  function groupNotesByCount(notes, requestedGroups) {
    const groupCount = Math.max(1, Math.min(requestedGroups, notes.length));
    const groups = [];
    for (let i = 0; i < groupCount; i++) {
      const start = Math.floor(i * notes.length / groupCount);
      const end = Math.floor((i + 1) * notes.length / groupCount);
      groups.push(notes.slice(start, end).join('\n\n'));
    }
    return groups;
  }

  function allocateCountsByLength(groups, total) {
    const count = groups.length;
    const result = groups.map(function (group, index) {
      return { index: index, amount: 1, remainder: 0 };
    });
    let remaining = Math.max(0, total - count);
    if (!remaining) return result;
    const totalLength = groups.reduce(function (sum, group) { return sum + group.length; }, 0);
    let assigned = 0;
    result.forEach(function (item) {
      const exact = remaining * groups[item.index].length / Math.max(1, totalLength);
      const whole = Math.floor(exact);
      item.amount += whole;
      item.remainder = exact - whole;
      assigned += whole;
    });
    const leftovers = remaining - assigned;
    result.slice().sort(function (a, b) {
      return b.remainder - a.remainder || a.index - b.index;
    }).slice(0, leftovers).forEach(function (item) {
      result[item.index].amount += 1;
    });
    return result;
  }

  renderQuiz = function (output, questions) {
    output.textContent = '';
    const score = appendText(output, 'div', 'النتيجة: 0 من 0 أسئلة موضوعية');
    score.style.fontWeight = '800';
    score.style.margin = '12px 0';
    const list = document.createElement('div');
    output.appendChild(list);
    let correct = 0;
    let attempted = 0;
    let reviewed = 0;

    function updateScore() {
      score.textContent = 'النتيجة: ' + correct + ' من ' + attempted +
        ' أسئلة موضوعية · تمت مراجعة ' + reviewed + ' أسئلة مقالية/إكمال';
    }

    questions.forEach(function (question, index) {
      const card = document.createElement('div');
      card.className = 'q';
      appendText(card, 'b', (index + 1) + ') ' + (question.q || 'سؤال بدون نص'));
      if (question.source) appendText(card, 'small', 'المصدر: ' + question.source);

      function finish(result, answerText) {
        if (card.dataset.done) return;
        card.dataset.done = '1';
        if (result === true || result === false) {
          attempted++;
          if (result === true) correct++;
        } else {
          reviewed++;
        }
        updateScore();
        if (answerText) appendText(card, 'div', answerText, 'out');
        if (question.explain) appendText(card, 'small', 'التفسير: ' + question.explain);
      }

      if (question.type === 'mcq' || question.type === 'tf') {
        const options = question.type === 'tf' ? ['صح', 'خطأ'] :
          (Array.isArray(question.options) ? question.options : []);
        const isTrue = question.answer === true || String(question.answer).toLowerCase() === 'true';
        const answerIndex = question.type === 'tf' ? (isTrue ? 0 : 1) : Number(question.answer);
        options.forEach(function (option, optionIndex) {
          const choice = document.createElement('button');
          choice.className = 'opt';
          choice.textContent = String(option);
          choice.onclick = function () {
            if (card.dataset.done) return;
            const isCorrect = optionIndex === answerIndex;
            const buttons = card.querySelectorAll('.opt');
            choice.classList.add(isCorrect ? 'ok' : 'no');
            if (buttons[answerIndex]) buttons[answerIndex].classList.add('ok');
            buttons.forEach(function (item) { item.disabled = true; });
            finish(isCorrect, isCorrect ? 'إجابة صحيحة ✓' : 'الإجابة الصحيحة: ' + (options[answerIndex] || 'غير محددة'));
          };
          card.appendChild(choice);
        });
      } else {
        const answerButton = appendText(card, 'button', 'إظهار الإجابة النموذجية', 'b');
        answerButton.onclick = function () {
          answerButton.disabled = true;
          finish(null, 'الإجابة النموذجية: ' + (question.answer || 'لا توجد إجابة مرفقة'));
        };
      }
      list.appendChild(card);
    });
  };

  window.makeQuiz = function (button) {
    const text = sourceText();
    if (!text) { alert('ارفع ملفًا أو الصق نص المحاضرة أولًا.'); return; }
    const output = $('quizOut');
    const requested = Math.max(3, Math.min(40, Number($('qn').value) || 10));
    runTask(button, output, async function () {
      const notes = await extractNotesForAll(text, output, 'إعداد اختبار شامل يغطي المحاضرة كلها');
      const groups = groupNotesByCount(notes, requested);
      const plan = allocateCountsByLength(groups, requested);
      const allQuestions = [];

      for (let i = 0; i < plan.length; i++) {
        const item = plan[i];
        output.textContent = 'إنشاء الأسئلة من تغطية ' + (i + 1) + ' من ' + plan.length +
          ' — تم تحليل ' + notes.length + ' أجزاء من المصدر';
        const prompt =
          'أنشئ ' + item.amount + ' سؤالًا جامعيًا من الملاحظات المرفقة. هذه الملاحظات ناتجة عن أجزاء متتابعة من المحاضرة، وقد جرى تجميعها لتغطية المحتوى كاملًا. ' +
          'لا تتجاهل أي قسم من الملاحظات، ونوّع بين mcq و tf و fill و essay قدر الإمكان. ' +
          'يجب أن تكون الإجابة مستندة إلى النص فقط، وأرفق رقم الصفحة أو الشريحة عندما يذكر في المصدر. ' +
          'أخرج JSON صالحًا فقط بهذا الشكل: {"questions":[{"type":"mcq","q":"السؤال","options":["أ","ب","ج","د"],"answer":0,"explain":"التفسير","source":"الصفحة 2"},{"type":"tf","q":"العبارة","answer":true,"explain":"التفسير","source":"الشريحة 3"},{"type":"fill","q":"أكمل: ...","answer":"الإجابة","explain":"التفسير","source":"الصفحة 4"},{"type":"essay","q":"السؤال","answer":"إجابة نموذجية","source":"الصفحة 5"}]}. ' +
          'في mcq يجب أن يكون answer رقم الاختيار من صفر إلى ثلاثة. وفي tf استخدم true أو false.\n\n' +
          groups[item.index];
        const raw = await ai([
          { role: 'system', content: 'أنت واضع امتحانات جامعية دقيق. لا تضف معلومة من خارج الملاحظات، وأخرج JSON فقط.' },
          { role: 'user', content: prompt }
        ]);
        const data = cleanJson(raw);
        const questions = Array.isArray(data.questions) ? data.questions : [];
        questions.slice(0, item.amount).forEach(function (question) {
          question.source = question.source || 'من الملاحظات المجمعة للمحاضرة';
          allQuestions.push(question);
        });
      }

      if (!allQuestions.length) throw new Error('لم يتم إنشاء أسئلة صالحة. أعد المحاولة.');
      renderQuiz(output, allQuestions);
      await saveStudyArtifact('quiz', 'اختبار ' + new Date().toLocaleString('ar-EG'), allQuestions, { questionCount: allQuestions.length });
      await window.refreshLibrary();
      if (allQuestions.length < requested) {
        appendText(output, 'small', 'ملاحظة: أنشأ النموذج ' + allQuestions.length + ' سؤالًا من أصل ' + requested + ' مطلوب؛ راجع عدد الأسئلة أو أعد المحاولة.');
      }
    });
  };

  window.makeVideo = function (button) {
    const text = sourceText();
    if (!text) { alert('ارفع ملفًا أو الصق نص المحاضرة أولًا.'); return; }
    const output = $('vidOut');
    const requested = Math.max(3, Math.min(15, Number($('vn').value) || 6));
    runTask(button, output, async function () {
      const notes = await extractNotesForAll(text, output, 'إعداد عرض شرح تعليمي يغطي المحاضرة كلها');
      const groups = groupNotesByCount(notes, requested);
      const plan = allocateCountsByLength(groups, requested);
      const slides = [];

      for (let i = 0; i < plan.length; i++) {
        const item = plan[i];
        output.textContent = 'إعداد شرائح الشرح ' + (i + 1) + ' من ' + plan.length +
          ' — تم تحليل ' + notes.length + ' أجزاء من المصدر';
        const prompt =
          'أنشئ ' + item.amount + ' شرائح شرح تعليمية من الملاحظات المرفقة. غطّ كل الأفكار الموجودة في الملاحظات وحافظ على ترتيبها. ' +
          'كل شريحة يجب أن تحتوي title و bullets (من 2 إلى 5 نقاط) و narration (شرح صوتي واضح). لا تضف معلومات خارج المصدر. ' +
          'أرفق رقم الصفحة أو الشريحة عند توفره. أخرج JSON فقط: {"slides":[{"title":"عنوان","bullets":["نقطة 1","نقطة 2"],"narration":"شرح المدرس","source":"الصفحة 2"}]}.\n\n' +
          groups[item.index];
        const raw = await ai([
          { role: 'system', content: 'أنت معدّ دروس تعليمية. اعتمد على الملاحظات فقط وأخرج JSON صالحًا دون Markdown.' },
          { role: 'user', content: prompt }
        ]);
        const data = cleanJson(raw);
        const partSlides = Array.isArray(data.slides) ? data.slides : [];
        partSlides.slice(0, item.amount).forEach(function (slide) {
          slide.source = slide.source || 'من الملاحظات المجمعة للمحاضرة';
          slides.push(slide);
        });
      }

      if (!slides.length) throw new Error('لم يتم إنشاء شرائح صالحة.');
      renderSlides(output, slides);
      await saveStudyArtifact('slides', 'شرح ' + new Date().toLocaleString('ar-EG'), slides, { slideCount: slides.length });
      await window.refreshLibrary();
      if (slides.length < requested) {
        appendText(output, 'small', 'ملاحظة: أنشأ النموذج ' + slides.length + ' شريحة من أصل ' + requested + ' مطلوبة.');
      }
    });
  };

  const uploadZone = document.querySelector('.upload-zone');
  const fileInput = $('fi');
  if (uploadZone && fileInput) {
    ['dragenter', 'dragover'].forEach(function (eventName) {
      uploadZone.addEventListener(eventName, function (event) {
        event.preventDefault();
        uploadZone.classList.add('is-dragging');
      });
    });
    ['dragleave', 'drop'].forEach(function (eventName) {
      uploadZone.addEventListener(eventName, function (event) {
        event.preventDefault();
        uploadZone.classList.remove('is-dragging');
      });
    });
    uploadZone.addEventListener('drop', function (event) {
      const files = event.dataTransfer && event.dataTransfer.files;
      if (!files || !files.length) return;
      if (typeof DataTransfer !== 'undefined') {
        const transfer = new DataTransfer();
        Array.from(files).forEach(function (file) { transfer.items.add(file); });
        fileInput.files = transfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        $('info').textContent = 'تعذر استخدام السحب والإفلات في هذا المتصفح؛ استخدم زر اختيار الملفات.';
      }
    });
  }

  sourceChunks = function (text, maxSize) {
    const max = maxSize || CHUNK_SIZE;
    const segments = [];
    let marker = '';
    let lines = [];

    function flushSegment() {
      if (marker || lines.some(function (line) { return line.trim(); })) {
        segments.push({ marker: marker, text: lines.join('\n').trim() });
      }
      lines = [];
    }

    text.split(/\r?\n/).forEach(function (line) {
      const found = line.trim().match(/^\[(PAGE|SLIDE):(\d+)\]$/);
      if (found) {
        flushSegment();
        marker = '[' + found[1] + ':' + found[2] + ']';
      } else {
        lines.push(line);
      }
    });
    flushSegment();

    const chunks = [];
    let current = '';
    function flushChunk() {
      if (current.trim()) chunks.push(current.trim());
      current = '';
    }

    segments.forEach(function (segment) {
      const prefix = segment.marker ? segment.marker + '\n' : '';
      const contentLines = segment.text ? segment.text.split('\n') : [];
      if (!contentLines.length) {
        const markerBlock = prefix.trim();
        if (!current) current = markerBlock;
        else if (current.length + markerBlock.length + 2 <= max) current += '\n\n' + markerBlock;
        else { flushChunk(); current = markerBlock; }
        return;
      }

      const bodyLength = segment.text.length;
      if (prefix.length + bodyLength <= max) {
        const block = prefix + segment.text;
        if (!current) current = block;
        else if (current.length + block.length + 2 <= max) current += '\n\n' + block;
        else { flushChunk(); current = block; }
        return;
      }

      if (current) flushChunk();
      let piece = prefix;
      const capacity = Math.max(1000, max - prefix.length);
      contentLines.forEach(function (line) {
        if (line.length > capacity) {
          if (piece.trim() !== prefix.trim()) {
            chunks.push(piece.trim());
            piece = prefix;
          }
          for (let offset = 0; offset < line.length; offset += capacity) {
            const part = line.slice(offset, offset + capacity);
            if (offset + capacity < line.length) chunks.push((prefix + part).trim());
            else piece = prefix + part;
          }
          return;
        }
        if (piece.length + line.length + 1 > max && piece.trim() !== prefix.trim()) {
          chunks.push(piece.trim());
          piece = prefix;
        }
        piece += (piece.endsWith('\n') || !piece ? '' : '\n') + line;
      });
      if (piece.trim()) current = piece;
    });

    flushChunk();
    return chunks;
  };

  const DB_NAME = 'studyai-library';
  const DB_VERSION = 1;
  let databasePromise = null;
  let activeMaterialId = null;
  let activeMaterialTitle = 'محاضرة جديدة';
  let ocrWorkerPromise = null;

  function openStudyDatabase() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('هذا المتصفح لا يدعم التخزين المحلي المتقدم.'));
    if (databasePromise) return databasePromise;
    databasePromise = new Promise(function (resolve, reject) {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains('materials')) db.createObjectStore('materials', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('artifacts')) db.createObjectStore('artifacts', { keyPath: 'id', autoIncrement: true });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('تعذر فتح المكتبة المحلية.')); };
    });
    return databasePromise;
  }

  async function storeRecord(storeName, record) {
    const db = await openStudyDatabase();
    return new Promise(function (resolve, reject) {
      const transaction = db.transaction(storeName, 'readwrite');
      const request = transaction.objectStore(storeName).put(record);
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('تعذر حفظ العنصر.')); };
    });
  }

  async function readRecords(storeName) {
    const db = await openStudyDatabase();
    return new Promise(function (resolve, reject) {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = function () { resolve(request.result || []); };
      request.onerror = function () { reject(request.error || new Error('تعذر قراءة المكتبة.')); };
    });
  }

  async function removeRecord(storeName, id) {
    const db = await openStudyDatabase();
    return new Promise(function (resolve, reject) {
      const request = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(Number(id));
      request.onsuccess = function () { resolve(true); };
      request.onerror = function () { reject(request.error || new Error('تعذر حذف العنصر.')); };
    });
  }

  async function saveMaterialRecord(text, title) {
    const record = {
      id: activeMaterialId || undefined,
      title: title || activeMaterialTitle || 'محاضرة بدون عنوان',
      text: text,
      chars: text.length,
      updatedAt: Date.now(),
      createdAt: Date.now()
    };
    const id = await storeRecord('materials', record);
    activeMaterialId = id;
    activeMaterialTitle = record.title;
    const button = $('saveMaterial');
    if (button) button.textContent = '✓ تم الحفظ في مكتبتي';
    return id;
  }

  async function saveStudyArtifact(type, title, content, extraData) {
    const record = Object.assign({
      type: type,
      title: title,
      content: content,
      materialId: activeMaterialId,
      createdAt: Date.now()
    }, extraData || {});
    return storeRecord('artifacts', record);
  }

  function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function textNode(parent, tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text == null ? '' : String(text);
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  }

  function actionButton(parent, label, callback, className) {
    const button = textNode(parent, 'button', label, className || 'b button secondary');
    button.type = 'button';
    button.addEventListener('click', callback);
    return button;
  }

  window.openSavedMaterial = async function (id) {
    try {
      const items = await readRecords('materials');
      const item = items.find(function (entry) { return Number(entry.id) === Number(id); });
      if (!item) throw new Error('لم يتم العثور على المحاضرة.');
      $('txt').value = item.text;
      activeMaterialId = item.id;
      activeMaterialTitle = item.title;
      const button = $('saveMaterial');
      if (button) button.textContent = '✓ محفوظة في مكتبتي';
      if (typeof show === 'function') show('files');
      $('info').textContent = 'تم فتح: ' + item.title + ' — ' + item.chars.toLocaleString('en-US') + ' حرف';
    } catch (error) {
      alert('تعذر فتح المحاضرة: ' + error.message);
    }
  };

  window.deleteSavedItem = async function (storeName, id) {
    if (!confirm('هل تريد حذف هذا العنصر من هذا الجهاز؟')) return;
    try {
      await removeRecord(storeName, id);
      if (storeName === 'materials' && Number(activeMaterialId) === Number(id)) {
        activeMaterialId = null;
        activeMaterialTitle = 'محاضرة جديدة';
      }
      await window.refreshLibrary();
      await window.refreshReview();
    } catch (error) {
      alert('تعذر الحذف: ' + error.message);
    }
  };

  window.refreshLibrary = async function () {
    const output = $('libraryOut');
    if (!output) return;
    clearNode(output);
    try {
      const materials = (await readRecords('materials')).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
      const artifacts = (await readRecords('artifacts')).sort(function (a, b) { return b.createdAt - a.createdAt; });
      textNode(output, 'h4', 'المحاضرات (' + materials.length + ')');
      if (!materials.length) textNode(output, 'p', 'لم تحفظ أي محاضرة بعد. ارفع ملفًا ثم اضغط حفظ في مكتبتي.');
      materials.forEach(function (item) {
        const row = document.createElement('div');
        row.className = 'q';
        textNode(row, 'b', item.title || 'محاضرة بدون عنوان');
        textNode(row, 'small', (item.chars || 0).toLocaleString('en-US') + ' حرف · آخر تعديل ' + new Date(item.updatedAt).toLocaleString('ar-EG'));
        actionButton(row, 'فتح المحاضرة', function () { window.openSavedMaterial(item.id); });
        actionButton(row, 'حذف', function () { window.deleteSavedItem('materials', item.id); });
        output.appendChild(row);
      });
      textNode(output, 'h4', 'مخرجات المذاكرة (' + artifacts.length + ')');
      if (!artifacts.length) textNode(output, 'p', 'ستظهر هنا الملخصات والاختبارات وشرائح الشرح وبطاقات الحفظ التي تنشئها.');
      artifacts.forEach(function (item) {
        const row = document.createElement('div');
        row.className = 'q';
        const kind = { summary: 'ملخص', quiz: 'اختبار', slides: 'شرائح شرح', flashcard: 'بطاقة حفظ' }[item.type] || 'مادة';
        textNode(row, 'b', kind + ' · ' + item.title);
        textNode(row, 'small', new Date(item.createdAt).toLocaleString('ar-EG'));
        actionButton(row, 'عرض', function () {
          const content = typeof item.content === 'string' ? item.content : JSON.stringify(item.content, null, 2);
          const detail = document.createElement('pre');
          detail.className = 'out';
          detail.textContent = content;
          row.appendChild(detail);
        });
        actionButton(row, 'حذف', function () { window.deleteSavedItem('artifacts', item.id); });
        output.appendChild(row);
      });
    } catch (error) {
      textNode(output, 'p', 'تعذر فتح المكتبة: ' + error.message);
    }
  };

  window.refreshReview = async function () {
    const output = $('reviewOut');
    if (!output) return;
    clearNode(output);
    try {
      const cards = (await readRecords('artifacts'))
        .filter(function (item) { return item.type === 'flashcard'; })
        .sort(function (a, b) { return (a.dueAt || 0) - (b.dueAt || 0); });
      const due = cards.filter(function (item) { return (item.dueAt || 0) <= Date.now(); });
      textNode(output, 'p', 'إجمالي البطاقات: ' + cards.length + ' · المستحقة الآن: ' + due.length);
      if (!due.length) {
        textNode(output, 'div', cards.length ? 'أحسنت! لا توجد بطاقات مستحقة الآن. ارجع في موعد المراجعة القادم.' : 'لا توجد بطاقات بعد. أنشئ بطاقات حفظ من استوديو الفهم.');
        return;
      }
      const card = due[0];
      const panel = document.createElement('div');
      panel.className = 'slide';
      textNode(panel, 'small', 'بطاقة ' + (1) + ' من ' + due.length + ' · ' + (card.source || 'مصدر المحاضرة'));
      textNode(panel, 'h2', card.title || 'سؤال مراجعة');
      const reveal = actionButton(panel, 'إظهار الإجابة', function () {
        if (panel.querySelector('.review-answer')) return;
        textNode(panel, 'div', card.content || '', 'review-answer');
        textNode(panel, 'small', 'كيف كان تذكّرك للإجابة؟');
        const ratings = document.createElement('div');
        ratings.className = 'hero-actions';
        actionButton(ratings, 'صعبة · غدًا', function () { window.rateFlashcard(card.id, 'hard'); });
        actionButton(ratings, 'جيدة · بعد يومين', function () { window.rateFlashcard(card.id, 'good'); });
        actionButton(ratings, 'سهلة · بعد 4 أيام', function () { window.rateFlashcard(card.id, 'easy'); });
        panel.appendChild(ratings);
      });
      output.appendChild(panel);
    } catch (error) {
      textNode(output, 'p', 'تعذر تحميل المراجعة: ' + error.message);
    }
  };

  window.rateFlashcard = async function (id, rating) {
    try {
      const cards = await readRecords('artifacts');
      const card = cards.find(function (item) { return Number(item.id) === Number(id); });
      if (!card) throw new Error('البطاقة غير موجودة.');
      const oldInterval = Number(card.intervalDays || 0);
      const nextInterval = rating === 'hard' ? Math.max(1, Math.round(oldInterval * 1.2)) :
        rating === 'good' ? (oldInterval ? Math.round(oldInterval * 2) : 2) :
        (oldInterval ? Math.round(oldInterval * 2.5) : 4);
      card.intervalDays = Math.min(45, nextInterval);
      card.dueAt = Date.now() + card.intervalDays * 24 * 60 * 60 * 1000;
      card.reviewedAt = Date.now();
      card.lastRating = rating;
      await storeRecord('artifacts', card);
      await window.refreshReview();
    } catch (error) {
      alert('تعذر تحديث موعد البطاقة: ' + error.message);
    }
  };

  window.makeFlashcards = function (button) {
    const text = sourceText();
    if (!text) { alert('ارفع محاضرة أولًا.'); return; }
    const output = $('flashOut');
    runTask(button, output, async function () {
      const notes = await extractNotesForAll(text, output, 'استخراج بطاقات سؤال وجواب للمذاكرة');
      const groups = groupNotesByCount(notes, Math.min(10, Math.max(1, Math.ceil(notes.length / 2))));
      let saved = 0;
      for (let i = 0; i < groups.length; i++) {
        output.textContent = 'إنشاء بطاقات الجزء ' + (i + 1) + ' من ' + groups.length;
        const prompt = 'أنشئ بطاقات حفظ من نوع سؤال وإجابة من النص التالي فقط. أنشئ بطاقتين إلى أربع بطاقات لهذا الجزء. ركّز على التعريفات والمصطلحات والمقارنات والأرقام والخطوات. تجنب الأسئلة العامة جدًا. أرفق الصفحة عند توفرها. أخرج JSON فقط بهذا الشكل: {"cards":[{"question":"السؤال","answer":"إجابة دقيقة","source":"الصفحة 3"}]}.\n\n' + groups[i];
        const raw = await ai([
          { role: 'system', content: 'أنت خبير في تصميم بطاقات المراجعة. لا تضف معلومة من خارج المصدر، وأخرج JSON صالحًا فقط.' },
          { role: 'user', content: prompt }
        ]);
        const data = cleanJson(raw);
        const cards = Array.isArray(data.cards) ? data.cards : [];
        for (const item of cards) {
          if (!item.question || !item.answer) continue;
          await saveStudyArtifact('flashcard', item.question, item.answer, {
            source: item.source || 'من المحاضرة',
            dueAt: Date.now(),
            intervalDays: 0
          });
          saved++;
        }
      }
      output.textContent = 'تم حفظ ' + saved + ' بطاقة في مراجعتك اليومية. افتح قسم المراجعة لبدء التدريب.';
      await window.refreshReview();
      await window.refreshLibrary();
    });
  };

  const previousShow = window.show;
  window.show = function (sectionId) {
    if (typeof previousShow === 'function') previousShow(sectionId);
    if (sectionId === 'library') window.refreshLibrary();
    if (sectionId === 'review') window.refreshReview();
  };

  const saveButton = $('saveMaterial');
  if (saveButton) {
    saveButton.addEventListener('click', async function () {
      const text = sourceText();
      if (!text) { alert('لا توجد محاضرة لحفظها.'); return; }
      try {
        const title = activeMaterialTitle === 'محاضرة جديدة' ? 'محاضرة ' + new Date().toLocaleDateString('ar-EG') : activeMaterialTitle;
        await saveMaterialRecord(text, title);
        $('info').textContent = 'تم حفظ المحاضرة في مكتبتك المحلية على هذا الجهاز.';
        await window.refreshLibrary();
      } catch (error) {
        $('info').textContent = 'تعذر الحفظ المحلي: ' + error.message;
      }
    });
  }

  async function loadOcrEngine() {
    if (window.Tesseract) return;
    await new Promise(function (resolve, reject) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('تعذر تحميل محرك OCR؛ تحقق من الاتصال بالإنترنت.')); };
      document.head.appendChild(script);
    });
    if (!window.Tesseract) throw new Error('محرك OCR غير متاح.');
  }

  async function getOcrWorker(statusNode) {
    if (!ocrWorkerPromise) {
      ocrWorkerPromise = (async function () {
        await loadOcrEngine();
        return window.Tesseract.createWorker('ara+eng', 1, {
          logger: function (message) {
            if (statusNode && message && typeof message.progress === 'number') {
              statusNode.textContent = 'OCR عربي + English: ' + Math.round(message.progress * 100) + '%';
            }
          }
        });
      })().catch(function (error) {
        ocrWorkerPromise = null;
        throw error;
      });
    }
    return ocrWorkerPromise;
  }

  async function recognizePdfPage(page, pageNo, statusNode) {
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    const worker = await getOcrWorker(statusNode);
    if (statusNode) statusNode.textContent = 'قراءة الصفحة المصوّرة رقم ' + pageNo + ' باستخدام OCR عربي + English...';
    const result = await worker.recognize(canvas);
    canvas.width = 0;
    canvas.height = 0;
    return result && result.data && result.data.text ? result.data.text.trim() : '';
  }

  window.chat = async function (question) {
    const text = sourceText();
    if (!question || !question.trim()) return;
    if (typeof add === 'function') add('me', question);
    else appendText($('chat'), 'div', question, 'msg me');
    conversation.push({ role: 'user', content: question });
    try {
      const context = text ? retrieveContext(question, text) : '';
      const dialect = $('dialect') ? $('dialect').value : 'egyptian';
      const languageRule = dialect === 'egyptian'
        ? 'اتكلم بالعامية المصرية الطبيعية والسلسة، كأنك مدرس مصري بيشرح لطالب. استخدم تعبيرات مصرية مفهومة من غير مبالغة أو ألفاظ عامية صعبة، واحتفظ بالمصطلحات العلمية الإنجليزية ثم فسّرها بالمصري.'
        : dialect === 'english'
          ? 'Answer in clear, friendly English. Keep scientific terms accurate and explain them simply.'
          : 'أجب بالعربية الفصحى المبسطة والواضحة، مع إبقاء المصطلحات العلمية الإنجليزية وشرحها.';
      const system =
        'أنت مدرس جامعي ومساعد مذاكرة. ' + languageRule + ' ' +
        'عند الاعتماد على المحاضرة، استشهد برقم الصفحة أو الشريحة الظاهر في النص مثل [صفحة 4]. ' +
        'لا تدّعِ أن معلومة موجودة في المحاضرة إذا لم تظهر في المقاطع المسترجعة. إذا لم تجد الإجابة فقل ذلك بوضوح وميّز أي معرفة خارجية عن محتوى المحاضرة.' +
        (context ? '\nمقاطع ذات صلة من محاضرة الطالب:\n' + context : '\nلم يرفع الطالب محاضرة بعد؛ أجب من معرفتك العامة مع توضيح ذلك.');
      const messages = [{ role: 'system', content: system }].concat(conversation.slice(-10));
      const answer = await ai(messages);
      conversation.push({ role: 'assistant', content: answer });
      if (typeof add === 'function') add('ai', answer);
      else appendText($('chat'), 'div', answer, 'msg ai');
      if (typeof say === 'function') say(answer.replace(/[*#_]/g, ''));
    } catch (error) {
      const message = 'تعذر الحصول على إجابة: ' + (error.message || String(error));
      if (typeof add === 'function') add('ai', message);
      else appendText($('chat'), 'div', message, 'msg ai');
    }
  };

})();