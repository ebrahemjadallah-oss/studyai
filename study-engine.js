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
              extracted += '[لا يوجد نص قابل للاستخراج من هذه الصفحة؛ قد تكون الصفحة صورة ممسوحة ضوئيًا وتحتاج OCR]\n';
              imagePages++;
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
    const totalLength = notes.reduce(function (sum, note) { return sum + note.length; }, 0);
    const targetLength = totalLength / groupCount;
    let current = [];
    let currentLength = 0;
    let consumed = 0;

    notes.forEach(function (note, index) {
      const groupsLeft = groupCount - groups.length;
      const notesLeft = notes.length - index;
      if (current.length && groupsLeft > 1 && notesLeft >= groupsLeft &&
          currentLength >= targetLength && currentLength + note.length > targetLength * 0.72) {
        groups.push(current.join('\n\n'));
        current = [];
        currentLength = 0;
      }
      current.push(note);
      currentLength += note.length;
      consumed += note.length;
    });
    if (current.length) groups.push(current.join('\n\n'));
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

})();