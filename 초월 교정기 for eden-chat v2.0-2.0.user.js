// ==UserScript==
// @name         초월 교정기 for eden-chat v2.0
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  eden-chat AI 메시지를 Gemini로 자동 교정·교체. 팝업 미리보기 및 리롤 지원.
// @match        https://www.eden-chat.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function () {
    'use strict';

    // =============================================
    //  상수
    // =============================================
    const CODE_BLOCK_RE   = /```([\s\S]*?)```/g;
    const FENCE_OPEN_SUB  = '===BLOCK_OPEN===';
    const FENCE_CLOSE_SUB = '===BLOCK_CLOSE===';

    const baseSystemPrompt = `[역할 및 목적]
당신은 최상급 작가이자 한국어 문장 교정 전문가입니다. 제공되는 한국어 텍스트의 맞춤법과 문법을 바로잡고, 어색한 표현을 자연스럽게 다듬으며, 번역투 표현을 제거하여 아래의 문체 기준에 따라 생동감 있는 한국어로 재창조하는 것이 당신의 유일한 목표입니다.

[핵심 교정 원칙]
1. 맞춤법 및 문법 교정: 띄어쓰기, 맞춤법, 문법 오류를 모두 바로잡으십시오. 조사는 받침 유무에 따라 정확히 선택하십시오(받침O → 은·이·을·과 / 받침X → 는·가·를·와).
2. 번역투 제거: '~하는 것이다', '~에 의해', '~되어지다' 같은 번역체 표현을 자연스러운 한국어로 변환하십시오. 대명사('당신', '그', '그녀', '그들' 등) 사용을 최소화하고 문맥에 맞는 자연스러운 호칭이나 생략으로 대체하십시오. 수동태는 가능한 능동태로 변환하십시오. 영어·일본어·중국어를 직역한 문장 구조를 수정합니다.
3. 원문의 의미와 문맥 보존: 교정 과정에서 원문의 맥락, 핵심 내용, 캐릭터의 감정선, 대화의 뉘앙스를 절대 훼손하지 마십시오.

[문장 구조 기준]
- 접속사(그러나·하지만·그리고·그래서)는 500자당 한 번으로 제한합니다. 인접 배치만으로 인과·대비·전환을 표현하는 것을 기본으로 하며, 같은 전환에 접속사를 두 개 겹치지 마십시오.
- 어미 변주 필수: 5문장 안에 최소 3가지 다른 어미 유형을 사용하십시오. 과거형 단순 나열이 이어지면 명사형 종결·단편·진행형으로 끊으십시오.
  ❌ "비가 왔다. 추웠다. 그는 걸었다."
  ✅ "빗물이 외투 깃을 파고들어 목덜미를 타고 흘러내렸고, 그는 웅덩이를 피하려는 노력도 없이 고개를 숙인 채 걸었다 — 마치 젖는 것이 더 이상 신경 쓸 에너지가 없는 일이 된 것처럼."

[대사]
- 인물의 대사는 구어체의 생동감과 호흡을 살려 변경하십시오.
- 대화 맥락상 부자연스러운 어투와 표현을 수정하십시오(기호 및 이름 표시 제외).
- 맥락에 따라 대사 중 인물의 호칭을 자연스럽게 수정하시오(예시: 성과 이름 구분, 애칭 등)

[출력 및 시스템 규칙]
- <details> 태그들 내부의 내용을 참조하여 맥락을 이해하고 교정을 진행하십시오.
- <details> 태그들은 수정 없이 원본 그대로 출력하십시오.
- 원문의 형태(줄바꿈, 별표*, 따옴표" " 등) 및 텍스트 기호를 원본대로 유지하십시오.
- 교정 외의 부연 설명, 인사말, 감상, 주석 등은 절대 출력하지 마십시오. 오직 교정된 본문만 제공하십시오`;

    // =============================================
    //  스타일
    // =============================================
    GM_addStyle(`
        #trans-setting-btn {
            position: fixed; z-index: 2147483647;
            background-color: #FF4432; color: white; border: none; border-radius: 50%;
            width: 48px; height: 48px; font-size: 24px; cursor: move;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: background-color 0.3s;
            display: flex; align-items: center; justify-content: center; touch-action: none;
        }
        #trans-setting-btn:hover { background-color: #e03c2a; }

        #trans-setting-panel {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            z-index: 2147483647; background-color: #F7F7F5; border: 1px solid #C7C5BD; border-radius: 8px;
            padding: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); display: none; width: 320px;
            max-width: 85vw;
        }
        #trans-setting-panel h4 { margin: 0 0 12px 0; color: #1A1918; font-family: sans-serif; font-size: 16px; text-align: center; }
        .trans-label { font-size: 13px; color: #61605A; margin-bottom: 4px; display: block; font-family: sans-serif; font-weight: bold; }
        #trans-api-key, #trans-model-select, #trans-custom-prompt {
            width: 100%; box-sizing: border-box; padding: 8px; margin-bottom: 12px;
            border: 1px solid #C7C5BD; border-radius: 4px; font-size: 13px; font-family: sans-serif;
        }
        #trans-custom-prompt { resize: vertical; }
        .trans-toggle-label {
            display: flex; align-items: center; gap: 8px; font-size: 13px; color: #1A1918;
            font-family: sans-serif; font-weight: bold; margin-bottom: 12px; cursor: pointer;
        }

        .trans-btn-group { display: flex; gap: 6px; margin-bottom: 10px; }
        .trans-panel-btn {
            flex: 1; padding: 10px 6px; border-radius: 6px; cursor: pointer; border: none;
            font-size: 13px; font-weight: bold; color: white; white-space: nowrap;
        }
        #trans-reset-btn { background-color: #61605A; }
        #trans-reset-btn:hover { background-color: #42413D; }
        #trans-save-btn { background-color: #FF4432; }
        #trans-save-btn:hover { background-color: #e03c2a; }

        #trans-translate-btn { background-color: #6A3DE8; width: 100%; margin-top: 4px; display: none; }
        #trans-translate-btn:hover { background-color: #5228CC; }
        #trans-translate-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        #trans-status-box {
            margin-top: 10px; padding: 8px 10px; border-radius: 4px;
            background-color: #EEEEEE; border: 1px solid #E5E5E1;
            font-size: 12px; font-family: sans-serif; color: #61605A;
            line-height: 1.5; min-height: 32px; display: none; word-break: break-word; text-align: center;
        }
        #trans-status-box.active { display: block; }
        #trans-status-box.ok   { color: #1a7a3a; background: #f0faf3; border-color: #a8d5b5; }
        #trans-status-box.err  { color: #b91c1c; background: #fff0f0; border-color: #f5a0a0; }
        #trans-status-box.info { color: #4A4A8A; background: #f3f0ff; border-color: #c4b8f5; }

        #trans-result-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: rgba(0,0,0,0.4); z-index: 2147483646; display: none;
        }
        #trans-result-modal {
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background-color: #FFFFFF; border-radius: 12px; padding: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2); z-index: 2147483647;
            width: 85%; max-width: 600px; display: none; flex-direction: column; gap: 12px;
        }
        .trans-modal-header { display: flex; justify-content: space-between; align-items: center; }
        .trans-modal-header h3 { margin: 0; color: #1A1918; font-family: sans-serif; font-size: 18px; }
        .trans-reroll-group { display: flex; gap: 6px; }
        #trans-modal-model { padding: 6px; border-radius: 4px; border: 1px solid #C7C5BD; font-size: 13px; }
        #trans-reroll-btn { background-color: #61605A; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; }
        #trans-reroll-btn:hover { background-color: #42413D; }
        #trans-reroll-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        #trans-result-content {
            background-color: #F7F7F5; padding: 16px; border-radius: 8px;
            font-size: 14px; line-height: 1.6; color: #1A1918; border: 1px solid #E5E5E1;
            max-height: 40vh; overflow-y: auto; white-space: pre-wrap; font-family: sans-serif;
        }
        .trans-modal-footer { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
        .trans-history-nav { display: flex; align-items: center; gap: 8px; }
        .trans-nav-btn { background: #E5E5E1; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; }
        .trans-nav-btn:hover { background: #D4D4D0; }
        .trans-nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        #trans-history-count { font-size: 13px; font-family: sans-serif; font-weight: bold; color: #61605A; }
        .trans-modal-btns { display: flex; gap: 8px; flex-wrap: wrap; }
        .trans-modal-btn { padding: 8px 14px; border-radius: 6px; cursor: pointer; border: none; font-weight: bold; font-size: 14px; color: white; }
        .trans-close-btn { background-color: #E5E5E1; color: #1A1918; }
        .trans-close-btn:hover { background-color: #D4D4D0; }
        .trans-patch-btn { background-color: #6A3DE8; }
        .trans-patch-btn:hover { background-color: #5228CC; }

        #trans-toast {
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            background: rgba(30,30,30,0.92); color: #fff; padding: 10px 20px;
            border-radius: 20px; font-size: 13px; font-family: sans-serif;
            z-index: 2147483647; pointer-events: none; opacity: 0; transition: opacity 0.3s;
        }
        #trans-toast.show { opacity: 1; }
    `);

    // =============================================
    //  DOM 빌드
    // =============================================
    const settingBtn = document.createElement('button');
    settingBtn.id = 'trans-setting-btn';
    settingBtn.innerHTML = '✏️';
    document.body.appendChild(settingBtn);

    const panel = document.createElement('div');
    panel.id = 'trans-setting-panel';
    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h4 style="margin:0;font-size:16px;color:#1A1918;font-family:sans-serif;">초월 교정 설정</h4>
            <button id="trans-panel-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#61605A;line-height:1;padding:0 4px;">✕</button>
        </div>
        <span class="trans-label">제미나이 모델명 (직접 입력):</span>
        <input type="text" id="trans-model-select" placeholder="예: gemini-flash-latest">
        <span class="trans-label">API 키:</span>
        <input type="text" id="trans-api-key" placeholder="API 키를 입력해주세요">
        <label class="trans-toggle-label">
            <input type="checkbox" id="trans-preview-toggle"> 팝업으로 미리보기 (끄면 자동 교체)
        </label>
        <span class="trans-label">교정 지침서 (수정 가능):</span>
        <textarea id="trans-custom-prompt" rows="6"></textarea>
        <div class="trans-btn-group">
            <button class="trans-panel-btn" id="trans-reset-btn">기본값 복구</button>
            <button class="trans-panel-btn" id="trans-save-btn">저장하기</button>
        </div>
        <button class="trans-panel-btn" id="trans-translate-btn">✨ 최신 답변 교정하기</button>
        <div id="trans-status-box"></div>
    `;
    document.body.appendChild(panel);

    const overlay = document.createElement('div');
    overlay.id = 'trans-result-overlay';
    document.body.appendChild(overlay);

    const resultModal = document.createElement('div');
    resultModal.id = 'trans-result-modal';
    resultModal.innerHTML = `
        <div class="trans-modal-header">
            <h3>✨ 교정 결과 확인</h3>
            <div class="trans-reroll-group">
                <input type="text" id="trans-modal-model" placeholder="모델명 입력" style="width:160px;padding:6px;border-radius:4px;border:1px solid #C7C5BD;font-size:13px;">
                <button id="trans-reroll-btn">다시 돌리기</button>
            </div>
        </div>
        <div id="trans-result-content"></div>
        <div class="trans-modal-footer">
            <div class="trans-history-nav">
                <button class="trans-nav-btn" id="trans-prev-btn">◀ 이전</button>
                <span id="trans-history-count">1 / 1</span>
                <button class="trans-nav-btn" id="trans-next-btn">다음 ▶</button>
            </div>
            <div class="trans-modal-btns">
                <button class="trans-modal-btn trans-close-btn" id="trans-close-modal">닫기</button>
                <button class="trans-modal-btn trans-patch-btn" id="trans-patch-modal">이 결과로 교체하기</button>
            </div>
        </div>
    `;
    document.body.appendChild(resultModal);

    const toast = document.createElement('div');
    toast.id = 'trans-toast';
    document.body.appendChild(toast);

    // =============================================
    //  설정 요소 참조 및 초기값 로드
    // =============================================
    const apiKeyInput       = document.getElementById('trans-api-key');
    const modelSelect       = document.getElementById('trans-model-select');
    const previewToggle     = document.getElementById('trans-preview-toggle');
    const customPromptInput = document.getElementById('trans-custom-prompt');
    const saveBtn           = document.getElementById('trans-save-btn');
    const resetBtn          = document.getElementById('trans-reset-btn');
    const translateBtn      = document.getElementById('trans-translate-btn');
    const statusBox         = document.getElementById('trans-status-box');

    const resultContent    = document.getElementById('trans-result-content');
    const closeModalBtn    = document.getElementById('trans-close-modal');
    const patchModalBtn    = document.getElementById('trans-patch-modal');
    const modalModelSelect = document.getElementById('trans-modal-model');
    const rerollBtn        = document.getElementById('trans-reroll-btn');
    const prevBtn          = document.getElementById('trans-prev-btn');
    const nextBtn          = document.getElementById('trans-next-btn');
    const historyCount     = document.getElementById('trans-history-count');

    apiKeyInput.value       = GM_getValue('apiKey', '');
    modelSelect.value       = GM_getValue('apiModel', 'gemini-flash-latest');
    previewToggle.checked   = GM_getValue('showPreview', true);
    customPromptInput.value = GM_getValue('customPrompt', baseSystemPrompt);

    // =============================================
    //  드래그
    // =============================================
    let isDragging = false, dragMoved = false, startX, startY, initialLeft, initialTop;

    const clampButtonPosition = () => {
        const w  = window.innerWidth,  h  = window.innerHeight;
        const bW = settingBtn.offsetWidth  || 48;
        const bH = settingBtn.offsetHeight || 48;

        let l = parseFloat(settingBtn.style.left);
        let t = parseFloat(settingBtn.style.top);

        if (isNaN(l) || l < 0 || l > w - bW) l = w - bW - 20;
        if (isNaN(t) || t < 0 || t > h - bH) t = h - bH - 20;

        settingBtn.style.left = l + 'px';
        settingBtn.style.top  = t + 'px';
        GM_setValue('btnPosX', settingBtn.style.left);
        GM_setValue('btnPosY', settingBtn.style.top);
    };

    const savedLeft = GM_getValue('btnPosX', '');
    const savedTop  = GM_getValue('btnPosY', '');
    if (savedLeft && savedTop) {
        settingBtn.style.left = savedLeft; settingBtn.style.top = savedTop;
        settingBtn.style.bottom = 'auto'; settingBtn.style.right = 'auto';
    } else {
        settingBtn.style.left = (window.innerWidth - 68) + 'px';
        settingBtn.style.top  = (window.innerHeight - 68) + 'px';
    }
    clampButtonPosition();
    setTimeout(clampButtonPosition, 100);
    setTimeout(clampButtonPosition, 500);
    window.addEventListener('resize', clampButtonPosition);

    function startDrag(e) {
        if (e.type === 'mousedown' && e.button !== 0) return;
        isDragging = true; dragMoved = false;
        startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        const rect = settingBtn.getBoundingClientRect();
        initialLeft = rect.left; initialTop = rect.top;
        settingBtn.style.bottom = 'auto'; settingBtn.style.right = 'auto';
    }
    function moveDrag(e) {
        if (!isDragging) return;
        const dx = (e.type.includes('mouse') ? e.clientX : e.touches[0].clientX) - startX;
        const dy = (e.type.includes('mouse') ? e.clientY : e.touches[0].clientY) - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
        if (dragMoved) {
            e.preventDefault();
            const w = window.innerWidth, h = window.innerHeight;
            const bW = settingBtn.offsetWidth, bH = settingBtn.offsetHeight;
            settingBtn.style.left = Math.max(0, Math.min(initialLeft + dx, w - bW)) + 'px';
            settingBtn.style.top  = Math.max(0, Math.min(initialTop  + dy, h - bH)) + 'px';
        }
    }
    function stopDrag() {
        if (!isDragging) return;
        isDragging = false;
        if (dragMoved) clampButtonPosition();
    }
    settingBtn.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', moveDrag, { passive: false });
    document.addEventListener('mouseup', stopDrag);
    settingBtn.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('touchmove', moveDrag, { passive: false });
    document.addEventListener('touchend', stopDrag);

    // =============================================
    //  유틸리티
    // =============================================
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function showToast(msg, duration = 3000) {
        toast.textContent = msg; toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    }
    function setStatus(msg, type = 'info') {
        statusBox.textContent = msg; statusBox.className = `active ${type}`;
    }
    function clearStatus() {
        statusBox.className = ''; statusBox.textContent = '';
    }
    function isChattingPage() {
        return true;
    }
    function buildFinalPrompt() {
        return GM_getValue('customPrompt', baseSystemPrompt);
    }

    // =============================================
    //  코드블럭 보존
    // =============================================
    function maskCodeBlocks(text)   { return text.replace(CODE_BLOCK_RE, (_, inner) => FENCE_OPEN_SUB + inner + FENCE_CLOSE_SUB); }
    function unmaskCodeBlocks(text) { return text.split(FENCE_OPEN_SUB).join('```').split(FENCE_CLOSE_SUB).join('```'); }
    function stripOuterFence(text)  { return text.replace(/^```[^\n]*\n([\s\S]*?)\n```\s*$/m, '$1').trim(); }

    // =============================================
    //  Gemini API 호출
    // =============================================
    function callGemini(text, overrideModel = null, userContext = '') {
        return new Promise((resolve, reject) => {
            const apiKey = GM_getValue('apiKey', '').trim();
            if (!apiKey) { reject(new Error('API 키가 설정되지 않았습니다.')); return; }

            const modelId = overrideModel || GM_getValue('apiModel', 'gemini-flash-latest');
            const masked = maskCodeBlocks(text);
            const contextBlock = userContext
                ? `[직전 유저 입력 - 맥락 참고용, 교정 대상 아님]\n${userContext}\n\n[교정 대상 AI 답변]\n${masked}`
                : masked;

            GM_xmlhttpRequest({
                method: 'POST',
                url: `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({
                    system_instruction: { parts: [{ text: buildFinalPrompt() }] },
                    contents: [{ parts: [{ text: contextBlock }] }],
                    generationConfig: { temperature: 0.7, thinkingConfig: { thinkingLevel: "Low" } },
                }),
                onload(res) {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data.error) { reject(new Error(data.error.message)); return; }
                        const raw      = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                        const cleaned  = stripOuterFence(raw);
                        const restored = unmaskCodeBlocks(cleaned);
                        resolve(restored);
                    } catch (e) { reject(e); }
                },
                onerror() { reject(new Error('네트워크 오류가 발생했습니다.')); },
            });
        });
    }

    // =============================================
    //  eden-chat.com UI 자동화 (★ 수정된 부분)
    // =============================================
    function findLastUserMessage() {
        const msgs = document.querySelectorAll('div.hidden.lg\\:block.whitespace-pre-line.text-white');
        if (!msgs.length) return '';
        return Array.from(msgs[msgs.length - 1].querySelectorAll('span'))
            .map(s => s.textContent.trim())
            .filter(Boolean)
            .join('\n');
    }

    function findLastPencilBtn() {
        const pencilBtns = document.querySelectorAll('button[aria-label="수정"]');
        return pencilBtns[pencilBtns.length - 1] || null;
    }

    function findEditArea() {
        return document.querySelector('textarea[placeholder="메시지 내용을 입력하세요..."]');
    }

    function findSaveBtn() {
        return Array.from(document.querySelectorAll('button')).find(
            btn => btn.querySelector('.lucide-save')
        ) || null;
    }

    // textarea용으로 교체 (React 상태 업데이트 호환)
    function setEditableContent(el, text) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
        ).set;
        nativeInputValueSetter.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async function applyTranslation(translated) {
        let editArea = findEditArea();
        if (!editArea) {
            const pencilBtn = findLastPencilBtn();
            if (!pencilBtn) throw new Error('수정 버튼을 찾을 수 없습니다. 채팅 페이지를 확인해주세요.');
            pencilBtn.click();
            await sleep(700);
            editArea = findEditArea();
        }
        if (!editArea) throw new Error('편집창을 열 수 없습니다.');

        setEditableContent(editArea, translated);
        await sleep(300);

        const saveBtn = findSaveBtn();
        if (!saveBtn) throw new Error('저장 버튼을 찾을 수 없습니다.');
        saveBtn.click();
    }

    // =============================================
    //  모달 상태 관리
    // =============================================
    let transHistory = [];
    let transIndex   = -1;
    let activeOriginalText = '';

    const updateModalState = () => {
        if (!transHistory.length) return;
        resultContent.innerText = transHistory[transIndex];
        historyCount.innerText  = `${transIndex + 1} / ${transHistory.length}`;
        prevBtn.disabled = transIndex === 0;
        nextBtn.disabled = transIndex === transHistory.length - 1;
    };

    const closeResultModal = () => {
        overlay.style.display = 'none';
        resultModal.style.display = 'none';
        panel.style.display = 'none';
        clearStatus();
    };

    closeModalBtn.addEventListener('click', closeResultModal);
    overlay.addEventListener('click', closeResultModal);
    prevBtn.addEventListener('click', () => { if (transIndex > 0) { transIndex--; updateModalState(); } });
    nextBtn.addEventListener('click', () => { if (transIndex < transHistory.length - 1) { transIndex++; updateModalState(); } });

    rerollBtn.addEventListener('click', async () => {
        try {
            rerollBtn.innerText = '재생성 중… ⏳'; rerollBtn.disabled = true;
            const newResult = await callGemini(activeOriginalText, modalModelSelect.value);
            transHistory.push(newResult);
            transIndex = transHistory.length - 1;
            updateModalState();
        } catch (e) { alert(e.message); }
        finally { rerollBtn.innerText = '다시 돌리기'; rerollBtn.disabled = false; }
    });

    patchModalBtn.addEventListener('click', async () => {
        if (!transHistory.length) return;
        try {
            patchModalBtn.innerText = '교체 중… ⏳'; patchModalBtn.disabled = true;
            await applyTranslation(transHistory[transIndex]);
            patchModalBtn.innerText = '교체 완료! ✔️';
            setTimeout(() => {
                closeResultModal();
                patchModalBtn.disabled = false;
                patchModalBtn.innerText = '이 결과로 교체하기';
            }, 2000);
        } catch (e) {
            alert(e.message);
            patchModalBtn.innerText = '이 결과로 교체하기';
            patchModalBtn.disabled = false;
        }
    });

    // =============================================
    //  메인 교정 로직
    // =============================================
    async function autoCorrect() {
        if (!isChattingPage()) { showToast('채팅방 페이지에서만 사용 가능합니다.'); return; }
        if (!GM_getValue('apiKey', '').trim()) {
            setStatus('API 키가 설정되지 않았습니다. 위 항목에서 입력 후 저장해주세요.', 'err'); return;
        }

        translateBtn.disabled = true;
        clearStatus();

        try {
            setStatus('① 편집 모드 진입 중…', 'info');
            const pencilBtn = findLastPencilBtn();
            if (!pencilBtn) throw new Error('AI 메시지의 수정 버튼을 찾을 수 없습니다. 마우스를 AI 메시지 위에 올려 두세요.');
            pencilBtn.click();
            await sleep(700);

            const editArea = findEditArea();
            if (!editArea) throw new Error('편집창이 열리지 않았습니다. 잠시 후 다시 시도해주세요.');

            const original = editArea.value.trim();
            if (!original) throw new Error('교정할 내용이 없습니다.');
            activeOriginalText = original;

            const userContext = findLastUserMessage();

            const usePreview = GM_getValue('showPreview', true);

            if (usePreview) {
                // ESC로 편집 모드 닫기 시도
                editArea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
                await sleep(400);

                setStatus('② 교정 중… (잠시 기다려 주세요)', 'info');
                const corrected = await callGemini(original, null, userContext);

                transHistory = [corrected];
                transIndex   = 0;
                modalModelSelect.value = GM_getValue('apiModel', 'gemini-flash-latest');

                panel.style.display  = 'none';
                overlay.style.display     = 'block';
                resultModal.style.display = 'flex';
                updateModalState();

            } else {
                setStatus('② 교정 중… (잠시 기다려 주세요)', 'info');
                const corrected = await callGemini(original, null, userContext);

                setStatus('③ 교정본 삽입 중…', 'info');
                await applyTranslation(corrected);

                setStatus('✅ 교정 교체 완료!', 'ok');
            }

        } catch (err) {
            setStatus(`❌ ${err.message}`, 'err');
            console.error('[초월 교정기 eden]', err);
        } finally {
            translateBtn.disabled = false;
        }
    }

    // =============================================
    //  설정 패널 이벤트
    // =============================================
    settingBtn.addEventListener('click', (e) => {
        if (dragMoved) { e.preventDefault(); e.stopPropagation(); return; }
        const isOpen = panel.style.display === 'block';
        panel.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) clearStatus();
    });

    document.getElementById('trans-panel-close').addEventListener('click', () => {
        panel.style.display = 'none';
        clearStatus();
    });

    resetBtn.addEventListener('click', () => {
        if (confirm('지침서를 기본값으로 초기화할까요?'))
            customPromptInput.value = baseSystemPrompt;
    });

    saveBtn.addEventListener('click', () => {
        GM_setValue('apiKey',      apiKeyInput.value.trim());
        GM_setValue('apiModel',    modelSelect.value);
        GM_setValue('showPreview', previewToggle.checked);
        GM_setValue('customPrompt', customPromptInput.value);
        saveBtn.textContent = '저장 완료!';
        setTimeout(() => { saveBtn.textContent = '저장하기'; }, 1200);
    });

    translateBtn.addEventListener('click', autoCorrect);

    // =============================================
    //  교정 버튼 표시 제어 (SPA 라우팅 대응)
    // =============================================
    function syncTranslateBtn() {
        translateBtn.style.display = isChattingPage() ? 'inline-block' : 'none';
    }
    syncTranslateBtn();

    let _lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== _lastUrl) { _lastUrl = location.href; setTimeout(syncTranslateBtn, 800); }
    }).observe(document, { subtree: true, childList: true });
    setInterval(syncTranslateBtn, 2000);

})();