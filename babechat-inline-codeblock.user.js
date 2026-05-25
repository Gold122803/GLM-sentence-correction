// ==UserScript==
// @name         초월 교정기 Inline Codeblock for babechat.ai
// @namespace    http://tampermonkey.net/
// @version      5.1.2
// @updateURL    https://raw.githubusercontent.com/Gold122803/GLM-sentence-correction/main/release/babechat-inline-codeblock.user.js
// @downloadURL  https://raw.githubusercontent.com/Gold122803/GLM-sentence-correction/main/release/babechat-inline-codeblock.user.js
// @description  babechat.ai AI 메시지를 인라인 버튼으로 교정·교체. 코드블럭 보존, details 맥락 전송 없음.
// @match        https://babechat.ai/*
// @match        https://www.babechat.ai/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// @connect      api.deepseek.com
// @connect      openrouter.ai
// ==/UserScript==

(function () {
    'use strict';

    // =============================================
    //  상수
    // =============================================
    const CODE_BLOCK_RE = /```([\s\S]*?)```/g;
    const PROTECTED_BLOCK_TOKEN_RE = /@@TC_PROTECTED_BLOCK_(\d+)@@/g;
    const FENCE_OPEN_SUB = '===BLOCK_OPEN===';
    const FENCE_CLOSE_SUB = '===BLOCK_CLOSE===';

    // v4.1: 사용자가 기존에 저장한 모델명을 존중합니다.
    // 새 설치/초기화 시에는 기존 v4.0 기본값을 유지합니다.
    const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';
    const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
    const DEFAULT_DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
    const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
    const DEFAULT_OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

    // v4.1 Gemini 안정화 옵션
    const GEMINI_TIMEOUT_MS = 120000;
    const GEMINI_MAX_RETRIES = 2;
    const GEMINI_RETRY_BASE_DELAY_MS = 1200;

    const baseSystemPrompt = `[역할 및 목적]
당신은 한국어 문장 교정 전문가다. 입력된 텍스트의 원문 형식과 구조를 유지하면서 한국어 본문과 NPC 대사를 자연스럽고 읽기 좋게 다듬는다.

목표는 원문의 사건, 정보, 감정선, 캐릭터성, 관계, 말투, 호칭, 장면 의도를 유지한 채 한국어 문장을 교정하는 것이다. 원문에 없는 사건, 감정, 설명, 행동, 관계 진전, 대사, 설정은 추가하지 않는다.

[작업 우선순위]
1. 원문의 줄바꿈, 문단 구분, Markdown 구조, 이미지 링크, 상태창, 이름표, 특수기호 보존
2. 원문의 사건, 정보, 감정선, 캐릭터성, 관계, 대화 의도 보존
3. 맞춤법, 띄어쓰기, 문법 오류 교정
4. 번역투와 부자연스러운 표현 제거
5. 해설투, 메타적 설명, 직접적 심리 설명을 줄이고 행동·반응·침묵·시선 중심으로 다듬기
6. 문장을 더 읽기 좋게 만들되, 원문의 의미와 장면 진행을 바꾸지 않기

[교정 대상 범위]
- 한국어 본문, 서술, NPC 대사만 교정한다.
- 코드블럭 안의 내용은 수정하지 않는다.
- Markdown 이미지 링크, URL, HTML 태그, 상태창, 시스템 표기, 메타 표기, 대괄호 태그, 이름표, 특수기호는 가능한 한 원본 그대로 유지한다.
- @@TC_PROTECTED_BLOCK_N@@ 형태의 토큰은 절대 변경하거나 삭제하지 않는다.

[핵심 교정 원칙]
- 띄어쓰기, 맞춤법, 문법 오류를 바로잡는다.
- 조사는 받침 유무와 문맥에 따라 정확히 선택한다.
- '~하는 것이다', '~에 의해', '~되어지다' 같은 번역체 표현을 자연스러운 한국어로 바꾼다.
- 대명사('당신', '그', '그녀', '그들' 등)는 문맥상 꼭 필요할 때만 사용하고, 자연스러운 호칭이나 생략으로 대체한다.
- 수동태는 가능한 능동태로 바꾸되, 원문의 뉘앙스가 달라지면 유지한다.
- 불필요한 접속사와 중복 표현을 줄이되, 문장이 어색해질 만큼 기계적으로 삭제하지 않는다.
- 원문에 없는 비유, 묘사, 감정, 행동, 회상, 설명을 추가하지 않는다.

[내면 요약문 처리]
- 감정·상태·원인·깨달음을 직접 요약하는 문장을 줄인다.
- 특히 "불안했다", "화가 났다", "긴장했다", "당황했다", "무서웠다", "상처받았다", "정신이 아득했다", "소름이 돋았다", "~라고 느꼈다", "~라는 사실을 깨달았다", "~인 것 같았다", "~때문이었다" 같은 표현은 필요할 때만 사용한다.
- 가능하면 이미 원문에 있는 손, 시선, 호흡, 걸음, 말끝, 침묵, 거리감, 물건, 자세, 반응을 사용해 같은 감정을 드러낸다.
- 원문에 없는 새 행동이나 새 의미를 만들지 말고, 문장을 작게 쪼개거나 기존 묘사의 초점을 바꾸는 방식으로 처리한다.
- 내면을 반드시 직접 써야 할 때는 한 문장 안에서 짧고 거칠게 처리하고, 원인을 길게 설명하지 않는다.

[문체 기준]
- 본문의 묘사와 서술의 종결어미는 원문의 문체를 유지한다.
- 감정·의도·관계·원인을 직접 설명하는 문장은 원문의 의미를 유지하는 범위에서 행동, 반응, 침묵, 시선, 거리감, 말의 리듬으로 자연스럽게 정돈한다.
- 다만 원문에 없는 행동이나 대사를 새로 만들지 않는다.
- "마치 ~인 듯했다", "~처럼 보였다", "~라는 사실을 깨달았다", "~한 감정이 들었다" 같은 해설투와 메타적 표현은 필요할 때만 최소한으로 사용한다.
- 독자에게 상황을 설명하는 문장, 작품 바깥에서 해설하는 문장, 교정자의 판단이 드러나는 문장을 출력하지 않는다.
- 인물의 외모와 행동은 담백하게 다듬는다. 과장된 수식, 장식적인 묘사, 불필요한 신체 초점은 줄인다.
- 문장 중 170cm, 64kg, C컵 가슴 같은 데이터, 수치 표현은 필요할 경우 감성적, 문학적 표현으로 자연스럽게 변경한다.
- 시간 명사구에서 수량 표현(10년 전, 두 달 후)은 필요할 경우 비유적, 감성적, 문학적으로 교정한다.

[대사]
- 큰따옴표("...") 안의 텍스트는 인물의 대사로 취급한다.
- 큰따옴표 안의 대사를 서술문으로 바꾸거나, 서술문을 임의로 대사화하지 않는다.
- 인물의 대사는 원래 말투와 감정선을 유지하면서 자연스러운 구어체로 다듬는다.
- 성과 이름이 뒤섞였거나, 애칭·직함·존칭·이름 부름이 관계에 비해 어색한 경우에는 원문의 관계를 바꾸지 않는 범위에서 한국어 대화에 맞는 호칭으로 정돈한다.
- 존댓말/반말, 높임 표현, 부름말, 말끝은 상대와의 관계 및 현재 장면의 긴장도에 맞게 자연스럽게 유지하거나 보정한다.
- 대화 맥락상 부자연스러운 어투와 표현을 변경한다.
- 새 대사, 새 고백, 새 약속, 새 관계 진전, 새 의도는 추가하지 않는다.
- 캐릭터의 성격, 관계, 거리감이 바뀌지 않도록 주의한다.
- 캐릭터의 거친 말투, 욕설 강도, 호칭, 대화 리듬은 과도하게 순화하지 않는다.

[보존 규칙]
- 코드블럭 안의 내용은 수정하지 않는다.
- 원문의 줄바꿈, 문단 구분, Markdown 기호, 이미지 링크, URL, HTML 태그, 별표, 따옴표, 괄호, 대괄호, 이름표, 특수기호를 가능한 한 유지한다.
- 상태창, 시스템 표기, 진행 표기, 메타 표기처럼 구조화된 정보는 원본 형식을 유지한다.
- 교정 외의 부연 설명, 인사말, 감상, 주석을 출력하지 않는다.
- 오직 교정된 전체 본문만 출력한다.`;
    // =============================================
    //  스타일
    // =============================================
    GM_addStyle(`
        /* v4.3.1: scrollable panels for small screens and long prompts/results. */
        #trans-setting-panel {
            max-height: min(86vh, 760px) !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            overscroll-behavior: contain !important;
            -webkit-overflow-scrolling: touch !important;
        }
        #trans-custom-prompt {
            min-height: 120px !important;
            max-height: 38vh !important;
            overflow-y: auto !important;
        }
        #trans-result-modal {
            max-height: min(86vh, 760px) !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            overscroll-behavior: contain !important;
            -webkit-overflow-scrolling: touch !important;
        }
        #trans-result-content {
            max-height: 42vh !important;
            overflow: auto !important;
            -webkit-overflow-scrolling: touch !important;
        }
        @media (max-width: 480px) {
            #trans-setting-panel, #trans-result-modal {
                width: calc(100vw - 24px) !important;
                max-width: calc(100vw - 24px) !important;
                max-height: 84vh !important;
                top: 12px !important;
                left: 12px !important;
                right: 12px !important;
                transform: none !important;
                padding: 14px !important;
            }
            #trans-custom-prompt {
                min-height: 110px !important;
                max-height: 30vh !important;
            }
        }
        /* Theme fix: keep the userscript UI readable regardless of site dark/light mode. */
        #trans-setting-panel, #trans-result-modal {
            color-scheme: light !important;
            color: #1A1918 !important;
            background-color: #FFFFFF;
        }
        #trans-setting-panel *, #trans-result-modal * { box-sizing: border-box; }
        #trans-setting-panel input, #trans-setting-panel select, #trans-setting-panel textarea,
        #trans-result-modal input, #trans-result-modal select, #trans-result-modal textarea,
        #trans-modal-model {
            color: #1A1918 !important;
            -webkit-text-fill-color: #1A1918 !important;
            background-color: #FFFFFF !important;
            caret-color: #1A1918 !important;
            border-color: #C7C5BD !important;
        }
        #trans-setting-panel input::placeholder, #trans-setting-panel textarea::placeholder,
        #trans-result-modal input::placeholder, #trans-result-modal textarea::placeholder {
            color: #7A7870 !important;
            -webkit-text-fill-color: #7A7870 !important;
            opacity: 1 !important;
        }
        #trans-setting-panel option, #trans-result-modal option {
            color: #1A1918 !important;
            background-color: #FFFFFF !important;
        }
        #trans-setting-panel h4, #trans-result-modal h3, .trans-toggle-label,
        #trans-history-count, #trans-result-content {
            color: #1A1918 !important;
        }
        .trans-label, .trans-help-text { color: #61605A !important; }
        .trans-nav-btn, .trans-close-btn {
            color: #1A1918 !important;
            background-color: #E5E5E1 !important;
        }
        .trans-panel-btn, #trans-reroll-btn, .trans-patch-btn,
        #trans-setting-btn, #trans-quick-btn {
            color: #FFFFFF !important;
            -webkit-text-fill-color: #FFFFFF !important;
        }
        #trans-setting-btn { display: none !important; visibility: hidden !important; pointer-events: none !important; }
        #trans-setting-btn:hover { background-color: #e03c2a; }
        #trans-quick-btn { display: none !important; visibility: hidden !important; pointer-events: none !important; }
        #trans-quick-btn:hover { background-color: #5228CC; }
        #trans-quick-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        #trans-setting-panel { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2147483647; background-color: #F7F7F5; border: 1px solid #C7C5BD; border-radius: 8px; padding: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); display: none; width: 320px; max-width: 85vw; }
        #trans-setting-panel h4 { margin: 0 0 12px 0; color: #1A1918; font-family: sans-serif; font-size: 16px; text-align: center; }
        .trans-label { font-size: 13px; color: #61605A; margin-bottom: 4px; display: block; font-family: sans-serif; font-weight: bold; }
        #trans-api-key, #trans-model-select, #trans-provider-select, #trans-deepseek-endpoint, #trans-deepseek-reasoning, #trans-openrouter-reasoning, #trans-custom-prompt { width: 100%; box-sizing: border-box; padding: 8px; margin-bottom: 12px; border: 1px solid #C7C5BD; border-radius: 4px; font-size: 13px; font-family: sans-serif; }
        #trans-custom-prompt { resize: vertical; }
        .trans-toggle-label { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; color: #1A1918; font-family: sans-serif; font-weight: bold; margin-bottom: 12px; }
        .trans-switch-title { white-space: nowrap; }
        #trans-auto-replace-toggle { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 92px; height: 34px; padding: 0 11px; border: none; border-radius: 999px; background: #C7C5BD; color: #FFFFFF; font-size: 12px; font-weight: bold; cursor: pointer; transition: background-color 0.2s ease; flex-shrink: 0; }
        #trans-auto-replace-toggle[aria-checked="true"] { background: #FF4432; }
        .trans-switch-text { position: relative; z-index: 1; pointer-events: none; }
        .trans-switch-knob { position: absolute; top: 4px; left: 4px; width: 26px; height: 26px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 2px 5px rgba(0,0,0,0.25); transition: transform 0.2s ease; }
        #trans-auto-replace-toggle[aria-checked="true"] .trans-switch-knob { transform: translateX(58px); }
        .trans-help-text { margin: -8px 0 10px 0; color: #7A7870; font-size: 12px; line-height: 1.45; font-family: sans-serif; }
        .trans-btn-group { display: flex; gap: 6px; margin-bottom: 10px; }
        .trans-panel-btn { flex: 1; padding: 10px 6px; border-radius: 6px; cursor: pointer; border: none; font-size: 13px; font-weight: bold; color: white; white-space: nowrap; }
        #trans-reset-btn { background-color: #61605A; }
        #trans-save-btn { background-color: #FF4432; }
        #trans-translate-btn { background-color: #6A3DE8; width: 100%; margin-top: 4px; display: none; }
        #trans-translate-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        #trans-status-box { margin-top: 10px; padding: 8px 10px; border-radius: 4px; background-color: #EEEEEE; border: 1px solid #E5E5E1; font-size: 12px; font-family: sans-serif; color: #61605A; line-height: 1.5; min-height: 32px; display: none; word-break: break-word; text-align: center; white-space: pre-wrap; }
        #trans-status-box.active { display: block; }
        #trans-status-box.ok { color: #1a7a3a; background: #f0faf3; border-color: #a8d5b5; }
        #trans-status-box.err { color: #b91c1c; background: #fff0f0; border-color: #f5a0a0; }
        #trans-status-box.info { color: #4A4A8A; background: #f3f0ff; border-color: #c4b8f5; }
        #trans-result-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0,0,0,0.4); z-index: 2147483646; display: none; }
        #trans-result-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: #FFFFFF; border-radius: 12px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); z-index: 2147483647; width: 85%; max-width: 600px; display: none; flex-direction: column; gap: 12px; }
        .trans-modal-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .trans-modal-header h3 { margin: 0; color: #1A1918; font-family: sans-serif; font-size: 18px; }
        .trans-reroll-group { display: flex; gap: 6px; }
        #trans-modal-model { padding: 6px; border-radius: 4px; border: 1px solid #C7C5BD; font-size: 13px; }
        #trans-reroll-btn { background-color: #61605A; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 13px; }
        #trans-result-content { background-color: #F7F7F5; padding: 16px; border-radius: 8px; font-size: 14px; line-height: 1.6; color: #1A1918; border: 1px solid #E5E5E1; max-height: 40vh; overflow-y: auto; white-space: pre-wrap; font-family: sans-serif; }
        .trans-modal-footer { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
        .trans-history-nav { display: flex; align-items: center; gap: 8px; }
        .trans-nav-btn { background: #E5E5E1; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; }
        .trans-nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        #trans-history-count { font-size: 13px; font-family: sans-serif; font-weight: bold; color: #61605A; }
        .trans-modal-btns { display: flex; gap: 8px; flex-wrap: wrap; }
        .trans-modal-btn { padding: 8px 14px; border-radius: 6px; cursor: pointer; border: none; font-weight: bold; font-size: 14px; color: white; }
        .trans-close-btn { background-color: #E5E5E1; color: #1A1918; }
        .trans-patch-btn { background-color: #6A3DE8; }
        #trans-toast { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: rgba(30,30,30,0.92); color: #fff; padding: 10px 20px; border-radius: 20px; font-size: 13px; font-family: sans-serif; z-index: 2147483647; pointer-events: none; opacity: 0; transition: opacity 0.3s; }
        #trans-toast.show { opacity: 1; }
        .trans-inline-correct-btn, .trans-inline-settings-btn {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            height: 24px !important;
            min-width: 42px !important;
            padding: 0 8px !important;
            margin: 0 !important;
            border-radius: 6px !important;
            border: 1px solid rgba(255,255,255,0.22) !important;
            color: #FFFFFF !important;
            -webkit-text-fill-color: #FFFFFF !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            line-height: 1 !important;
            cursor: pointer !important;
            opacity: 1 !important;
            visibility: visible !important;
            pointer-events: auto !important;
        }
        .trans-inline-correct-btn { background: #6A3DE8 !important; }
        .trans-inline-settings-btn { background: #FF4432 !important; }
        .trans-inline-panel {
            display: none;
            width: 100%;
            margin-top: 10px;
            padding: 12px;
            border: 1px solid rgba(255,255,255,0.14);
            border-radius: 8px;
            background: #1C1C1C;
            color: #FFFFFF;
            font-family: sans-serif;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .trans-inline-panel.trans-open { display: block; }
        .trans-inline-panel * { box-sizing: border-box; }
        .trans-inline-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .trans-inline-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .trans-inline-field.full { grid-column: 1 / -1; }
        .trans-inline-field label { color: #D8D8D8; font-size: 12px; font-weight: 700; }
        .trans-inline-field input,
        .trans-inline-field select,
        .trans-inline-field textarea {
            width: 100%;
            border: 1px solid #3B3B3B;
            border-radius: 6px;
            background: #111111;
            color: #FFFFFF;
            -webkit-text-fill-color: #FFFFFF;
            padding: 8px;
            font-size: 13px;
            outline: none;
        }
        .trans-inline-field textarea { min-height: 120px; max-height: 260px; resize: vertical; line-height: 1.45; }
        .trans-inline-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .trans-inline-action {
            border: 0;
            border-radius: 6px;
            color: #FFFFFF;
            -webkit-text-fill-color: #FFFFFF;
            padding: 8px 10px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
        }
        .trans-inline-save { background: #FF4432; }
        .trans-inline-close { background: #61605A; }
        .trans-inline-reset { background: #3B3B3B; }
        .trans-inline-status { display: none; margin-top: 8px; color: #BFBFBF; font-size: 12px; line-height: 1.45; white-space: pre-wrap; }
        .trans-inline-status.trans-show { display: block; }
        .trans-inline-run-status {
            display: block;
            width: 100%;
            margin-top: 8px;
            padding: 8px 10px;
            border-radius: 6px;
            background: #101010;
            border: 1px solid rgba(255,255,255,0.12);
            color: #D8D8D8;
            font-size: 12px;
            font-family: sans-serif;
            line-height: 1.45;
            white-space: pre-wrap;
        }
        .trans-inline-preview {
            display: block;
            width: 100%;
            margin-top: 10px;
            padding: 12px;
            border: 1px solid rgba(106,61,232,0.38);
            border-radius: 8px;
            background: #181622;
            color: #FFFFFF;
            font-family: sans-serif;
        }
        .trans-inline-preview-title { margin: 0 0 8px; color: #FFFFFF; font-size: 13px; font-weight: 800; }
        .trans-inline-preview-content {
            max-height: 320px;
            overflow: auto;
            padding: 10px;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.12);
            background: #101010;
            color: #EDEDED;
            white-space: pre-wrap;
            line-height: 1.55;
            font-size: 13px;
        }
        .trans-inline-preview-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .trans-inline-preview-action {
            border: 0;
            border-radius: 6px;
            color: #FFFFFF;
            -webkit-text-fill-color: #FFFFFF;
            padding: 8px 10px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
        }
        .trans-inline-apply { background: #6A3DE8; }
        .trans-inline-preview-close { background: #61605A; }
        @media (max-width: 560px) {
            .trans-inline-grid { grid-template-columns: 1fr; }
            .trans-inline-field.full { grid-column: auto; }
        }
    `);

    // =============================================
    //  DOM 빌드
    // =============================================
    const settingBtn = document.createElement('button');
    settingBtn.id = 'trans-setting-btn';
    settingBtn.type = 'button';
    settingBtn.title = '초월 교정 설정';
    settingBtn.setAttribute('aria-label', '초월 교정 설정');
    settingBtn.innerHTML = '✏️';
    document.body.appendChild(settingBtn);

    const quickBtn = document.createElement('button');
    quickBtn.id = 'trans-quick-btn';
    quickBtn.type = 'button';
    quickBtn.title = '저장된 설정으로 최신 답변 바로 교정';
    quickBtn.setAttribute('aria-label', '최신 답변 바로 교정');
    quickBtn.innerHTML = '⚡';
    document.body.appendChild(quickBtn);

    const panel = document.createElement('div');
    panel.id = 'trans-setting-panel';
    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h4 style="margin:0;font-size:16px;color:#1A1918;font-family:sans-serif;">초월 교정 설정 v5.1.2</h4>
            <button id="trans-panel-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#61605A;line-height:1;padding:0 4px;">✕</button>
        </div>
        <span class="trans-label">API 공급자:</span>
        <select id="trans-provider-select">
            <option value="gemini">Gemini</option>
            <option value="deepseek">DeepSeek</option>
            <option value="openrouter">OpenRouter</option>
        </select>
        <span class="trans-label" id="trans-model-label">모델명 (직접 입력):</span>
        <input type="text" id="trans-model-select" placeholder="예: gemini-flash-latest">
        <span class="trans-label" id="trans-api-key-label">API 키:</span>
        <input type="text" id="trans-api-key" placeholder="API 키를 입력해주세요">
        <div id="trans-deepseek-options" style="display:none;">
            <span class="trans-label">DeepSeek API 주소:</span>
            <input type="text" id="trans-deepseek-endpoint" placeholder="https://api.deepseek.com/chat/completions">
            <span class="trans-label">DeepSeek 추론 강도:</span>
            <select id="trans-deepseek-reasoning"><option value="disabled">Disabled</option><option value="high">High</option><option value="max">MAX</option></select>
        </div>
        <div id="trans-openrouter-options" style="display:none;">
            <span class="trans-label">OpenRouter 추론 강도:</span>
            <select id="trans-openrouter-reasoning"><option value="none">None</option><option value="minimal">Minimal</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">XHigh</option></select>
            <span class="trans-label">OpenRouter 공급자 슬러그 (선택):</span>
            <input type="text" id="trans-openrouter-provider" placeholder="예: siliconflow 또는 siliconflow, deepinfra">
        </div>
        <div class="trans-toggle-label">
            <span class="trans-switch-title">자동 교체</span>
            <button type="button" id="trans-auto-replace-toggle" role="switch" aria-checked="false"><span class="trans-switch-text">OFF</span><span class="trans-switch-knob"></span></button>
        </div>
        <span class="trans-label">교정 지침서 (수정 가능):</span>
        <div class="trans-help-text">v4.1은 Gemini 빈 응답을 성공 처리하지 않고 원인을 표시합니다.</div>
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
    const providerSelect = document.getElementById('trans-provider-select');
    const modelLabel = document.getElementById('trans-model-label');
    const apiKeyLabel = document.getElementById('trans-api-key-label');
    const apiKeyInput = document.getElementById('trans-api-key');
    const modelSelect = document.getElementById('trans-model-select');
    const deepSeekOptions = document.getElementById('trans-deepseek-options');
    const deepSeekEndpointInput = document.getElementById('trans-deepseek-endpoint');
    const deepSeekReasoningSelect = document.getElementById('trans-deepseek-reasoning');
    const openRouterOptions = document.getElementById('trans-openrouter-options');
    const openRouterReasoningSelect = document.getElementById('trans-openrouter-reasoning');
    const openRouterProviderInput = document.getElementById('trans-openrouter-provider');
    const autoReplaceToggle = document.getElementById('trans-auto-replace-toggle');
    const customPromptInput = document.getElementById('trans-custom-prompt');
    const saveBtn = document.getElementById('trans-save-btn');
    const resetBtn = document.getElementById('trans-reset-btn');
    const translateBtn = document.getElementById('trans-translate-btn');
    const statusBox = document.getElementById('trans-status-box');
    const resultContent = document.getElementById('trans-result-content');
    const closeModalBtn = document.getElementById('trans-close-modal');
    const patchModalBtn = document.getElementById('trans-patch-modal');
    const modalModelSelect = document.getElementById('trans-modal-model');
    const rerollBtn = document.getElementById('trans-reroll-btn');
    const prevBtn = document.getElementById('trans-prev-btn');
    const nextBtn = document.getElementById('trans-next-btn');
    const historyCount = document.getElementById('trans-history-count');

    let activeProvider = GM_getValue('apiProvider', 'gemini');

    function getProviderDisplayName(provider) {
        if (provider === 'deepseek') return 'DeepSeek';
        if (provider === 'openrouter') return 'OpenRouter';
        return 'Gemini';
    }
    function getDefaultModel(provider) {
        if (provider === 'deepseek') return DEFAULT_DEEPSEEK_MODEL;
        if (provider === 'openrouter') return DEFAULT_OPENROUTER_MODEL;
        return DEFAULT_GEMINI_MODEL;
    }
    function normalizeGeminiModel(model) {
        const value = String(model || '').trim();
        if (!value || value === 'gemini-flash-latest') return DEFAULT_GEMINI_MODEL;
        return value;
    }
    function getSavedModel(provider) {
        if (provider === 'deepseek') return GM_getValue('deepSeekModel', DEFAULT_DEEPSEEK_MODEL);
        if (provider === 'openrouter') return GM_getValue('openRouterModel', DEFAULT_OPENROUTER_MODEL);
        return normalizeGeminiModel(GM_getValue('apiModel', DEFAULT_GEMINI_MODEL));
    }
    function getSavedApiKey(provider) {
        if (provider === 'deepseek') return GM_getValue('deepSeekApiKey', '');
        if (provider === 'openrouter') return GM_getValue('openRouterApiKey', '');
        return GM_getValue('apiKey', '');
    }
    function getApiKeyStorageKey(provider) {
        if (provider === 'deepseek') return 'deepSeekApiKey';
        if (provider === 'openrouter') return 'openRouterApiKey';
        return 'apiKey';
    }
    function getModelStorageKey(provider) {
        if (provider === 'deepseek') return 'deepSeekModel';
        if (provider === 'openrouter') return 'openRouterModel';
        return 'apiModel';
    }
    function saveProviderFields(provider) {
        const rawModel = modelSelect.value.trim() || getDefaultModel(provider);
        const model = provider === 'gemini' ? normalizeGeminiModel(rawModel) : rawModel;
        if (provider === 'deepseek') {
            GM_setValue('deepSeekApiKey', apiKeyInput.value.trim());
            GM_setValue('deepSeekModel', model);
            GM_setValue('deepSeekEndpoint', deepSeekEndpointInput.value.trim() || DEFAULT_DEEPSEEK_ENDPOINT);
            GM_setValue('deepSeekReasoningEffort', deepSeekReasoningSelect.value || 'disabled');
        } else if (provider === 'openrouter') {
            GM_setValue('openRouterApiKey', apiKeyInput.value.trim());
            GM_setValue('openRouterModel', model);
            GM_setValue('openRouterReasoningEffort', openRouterReasoningSelect.value || 'none');
            GM_setValue('openRouterProvider', openRouterProviderInput.value.trim());
        } else {
            GM_setValue('apiKey', apiKeyInput.value.trim());
            GM_setValue('apiModel', model);
        }
    }
    function loadProviderFields(provider) {
        activeProvider = provider;
        providerSelect.value = provider;
        modelSelect.value = getSavedModel(provider);
        apiKeyInput.value = getSavedApiKey(provider);
        modelSelect.placeholder = `예: ${getDefaultModel(provider)}`;
        modelLabel.textContent = `${getProviderDisplayName(provider)} 모델명 (직접 입력):`;
        apiKeyLabel.textContent = `${getProviderDisplayName(provider)} API 키:`;
        deepSeekOptions.style.display = provider === 'deepseek' ? 'block' : 'none';
        openRouterOptions.style.display = provider === 'openrouter' ? 'block' : 'none';
        deepSeekEndpointInput.value = GM_getValue('deepSeekEndpoint', DEFAULT_DEEPSEEK_ENDPOINT);
        deepSeekReasoningSelect.value = GM_getValue('deepSeekReasoningEffort', 'disabled');
        openRouterReasoningSelect.value = GM_getValue('openRouterReasoningEffort', 'none');
        openRouterProviderInput.value = GM_getValue('openRouterProvider', '');
    }
    function getOpenRouterProviderRouting() {
        const only = GM_getValue('openRouterProvider', '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean);
        return only.length ? { only } : null;
    }
    function loadCustomPrompt() {
        customPromptInput.value = GM_getValue('customPrompt', baseSystemPrompt);
        GM_setValue('promptMode', 'custom');
    }
    function resetCustomPrompt() {
        customPromptInput.value = baseSystemPrompt;
        GM_setValue('promptMode', 'custom');
        GM_setValue('customPrompt', customPromptInput.value);
    }
    function setAutoReplaceEnabled(enabled) {
        autoReplaceToggle.setAttribute('aria-checked', String(enabled));
        autoReplaceToggle.querySelector('.trans-switch-text').textContent = enabled ? 'ON' : 'OFF';
        GM_setValue('showPreview', !enabled);
    }

    providerSelect.value = activeProvider;
    setAutoReplaceEnabled(!GM_getValue('showPreview', true));
    loadProviderFields(activeProvider);
    loadCustomPrompt();

    // =============================================
    //  드래그
    // =============================================
    let isDragging = false, dragMoved = false, activeDragBtn = null;
    let startX, startY, initialLeft, initialTop;
    const dragStateMap = new Map();
    function clampDraggableButton(btn, posXKey, posYKey) {
        const w = window.innerWidth, h = window.innerHeight;
        const bW = btn.offsetWidth || 54, bH = btn.offsetHeight || 54;
        let l = parseFloat(btn.style.left), t = parseFloat(btn.style.top);
        if (isNaN(l) || l < 12 || l > w - bW - 12) l = w - bW - 18;
        if (isNaN(t) || t < 12 || t > h - bH - 12) t = 88;
        l = Math.max(12, Math.min(l, w - bW - 12));
        t = Math.max(12, Math.min(t, h - bH - 12));
        btn.style.left = l + 'px'; btn.style.top = t + 'px';
        btn.style.bottom = 'auto'; btn.style.right = 'auto';
        btn.style.visibility = 'visible'; btn.style.pointerEvents = 'auto';
        GM_setValue(posXKey, btn.style.left); GM_setValue(posYKey, btn.style.top);
    }
    function initDraggableButton(btn, posXKey, posYKey, defaultLeft, defaultTop) {
        dragStateMap.set(btn, { posXKey, posYKey });
        const savedLeft = GM_getValue(posXKey, ''), savedTop = GM_getValue(posYKey, '');
        btn.style.left = savedLeft || defaultLeft + 'px';
        btn.style.top = savedTop || defaultTop + 'px';
        btn.style.bottom = 'auto'; btn.style.right = 'auto';
        clampDraggableButton(btn, posXKey, posYKey);
        btn.addEventListener('mousedown', startDrag);
        btn.addEventListener('touchstart', startDrag, { passive: false });
    }
    function clampAllDraggableButtons() { dragStateMap.forEach(({ posXKey, posYKey }, btn) => clampDraggableButton(btn, posXKey, posYKey)); }
    function bringUserscriptUiToFront() {
        [panel, overlay, resultModal, toast].forEach(el => {
            if (!el || !el.isConnected) return;
            if (el.parentElement !== document.body || el.nextElementSibling) {
                document.body.appendChild(el);
            }
        });
        [panel, resultModal, toast].forEach(el => {
            if (!el) return;
            el.style.setProperty('z-index', '2147483647', 'important');
        });
        settingBtn.style.setProperty('display', 'none', 'important');
        quickBtn.style.setProperty('display', 'none', 'important');
        overlay.style.setProperty('z-index', '2147483646', 'important');
    }
    initDraggableButton(settingBtn, 'btnPosX', 'btnPosY', window.innerWidth - 72, 88);
    initDraggableButton(quickBtn, 'quickBtnPosX', 'quickBtnPosY', window.innerWidth - 72, 152);
    setTimeout(() => { bringUserscriptUiToFront(); clampAllDraggableButtons(); }, 100);
    setTimeout(() => { bringUserscriptUiToFront(); clampAllDraggableButtons(); }, 500);
    window.addEventListener('resize', clampAllDraggableButtons);
    function startDrag(e) {
        if (e.type === 'mousedown' && e.button !== 0) return;
        activeDragBtn = e.currentTarget; isDragging = true; dragMoved = false;
        startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        const rect = activeDragBtn.getBoundingClientRect();
        initialLeft = rect.left; initialTop = rect.top;
        activeDragBtn.style.bottom = 'auto'; activeDragBtn.style.right = 'auto';
    }
    function moveDrag(e) {
        if (!isDragging || !activeDragBtn) return;
        const dx = (e.type.includes('mouse') ? e.clientX : e.touches[0].clientX) - startX;
        const dy = (e.type.includes('mouse') ? e.clientY : e.touches[0].clientY) - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
        if (dragMoved) {
            e.preventDefault();
            const w = window.innerWidth, h = window.innerHeight;
            const bW = activeDragBtn.offsetWidth, bH = activeDragBtn.offsetHeight;
            activeDragBtn.style.left = Math.max(0, Math.min(initialLeft + dx, w - bW)) + 'px';
            activeDragBtn.style.top = Math.max(0, Math.min(initialTop + dy, h - bH)) + 'px';
        }
    }
    function stopDrag() {
        if (!isDragging || !activeDragBtn) return;
        const state = dragStateMap.get(activeDragBtn);
        if (dragMoved && state) clampDraggableButton(activeDragBtn, state.posXKey, state.posYKey);
        isDragging = false; activeDragBtn = null;
    }
    document.addEventListener('mousemove', moveDrag, { passive: false });
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', moveDrag, { passive: false });
    document.addEventListener('touchend', stopDrag);

    // =============================================
    //  유틸리티
    // =============================================
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    function showToast(msg, duration = 3000) { toast.textContent = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), duration); }
    function setStatus(msg, type = 'info') { statusBox.textContent = msg; statusBox.className = `active ${type}`; }
    function clearStatus() { statusBox.className = ''; statusBox.textContent = ''; }
    function isChattingPage() { return location.hostname === 'babechat.ai' || location.hostname === 'www.babechat.ai'; }
    function buildFinalPrompt() { return customPromptInput?.value || GM_getValue('customPrompt', baseSystemPrompt); }
    function stripOuterFence(text) { return text.replace(/^```[^\n]*\n([\s\S]*?)\n```\s*$/m, '$1').trim(); }
    function createProtectedCorrectionInput(text) {
        const blocks = [];
        const codeContexts = [];
        const protect = (block, kind) => {
            const token = `@@TC_PROTECTED_BLOCK_${blocks.length}@@`;
            blocks.push({ token, block, kind });
            if (kind === 'code') codeContexts.push({ token, block });
            return token;
        };
        const protectedText = String(text || '')
            .replace(CODE_BLOCK_RE, match => protect(match, 'code'));
        return { protectedText, blocks, codeContexts };
    }
    function restoreProtectedBlocks(text, blocks) {
        let restored = String(text || '');
        const missing = [];
        for (const item of blocks) {
            if (!restored.includes(item.token)) missing.push(item.token);
            restored = restored.split(item.token).join(item.block);
        }
        const leftovers = restored.match(PROTECTED_BLOCK_TOKEN_RE);
        if (missing.length || leftovers?.length) {
            throw new Error(`보존 블록 토큰 오류: missing=${missing.join(', ') || 'none'}, leftover=${leftovers?.join(', ') || 'none'}`);
        }
        return restored;
    }
    function buildCorrectionInput(text, userContext = '') {
        const protection = createProtectedCorrectionInput(text);
        const tokens = protection.blocks.map(item => item.token);
        const tokenGuide = tokens.length
            ? `[보존 블록 토큰]\n다음 토큰은 코드블럭 등 보존 블록 원문을 대신한다. 교정 대상 안의 토큰 철자, 개수, 위치를 절대 바꾸지 말고 그대로 출력한다.\n${tokens.join('\n')}\n\n`
            : '';
        const codeContext = protection.codeContexts.length
            ? `[코드블럭 맥락 원문 - 참고용, 교정/출력 대상 아님]\n${protection.codeContexts.map(item => `${item.token}\n${item.block}`).join('\n\n')}\n\n`
            : '';
        const body = userContext
            ? `[직전 유저 입력 - 맥락 참고용, 교정 대상 아님]\n${userContext}\n\n[교정 대상 AI 답변]\n${protection.protectedText}`
            : `[교정 대상 AI 답변]\n${protection.protectedText}`;
        return { contextBlock: tokenGuide + codeContext + body, protectedBlocks: protection.blocks };
    }
    function safeStringify(value, limit = 1600) {
        try { return JSON.stringify(value, null, 2).slice(0, limit); }
        catch { return String(value).slice(0, limit); }
    }
    function getGeminiTextFromCandidate(candidate) {
        const parts = candidate?.content?.parts;
        if (!Array.isArray(parts)) return '';
        return parts.map(part => part?.text || '').join('');
    }
    function shouldRetryGeminiError(err) {
        const msg = String(err?.message || '');
        return /HTTP\s*(408|429|500|502|503|504)|시간이 초과|네트워크 오류|빈 응답/i.test(msg);
    }

    // =============================================
    //  API 호출
    // =============================================
    function callGeminiOnce(text, overrideModel = null, userContext = '') {
        return new Promise((resolve, reject) => {
            const apiKey = GM_getValue('apiKey', '').trim();
            if (!apiKey) { reject(new Error('Gemini API 키가 설정되지 않았습니다.')); return; }

            const modelId = (overrideModel || normalizeGeminiModel(GM_getValue('apiModel', DEFAULT_GEMINI_MODEL))).trim();
            const { contextBlock, protectedBlocks } = buildCorrectionInput(text, userContext);

            GM_xmlhttpRequest({
                method: 'POST',
                timeout: GEMINI_TIMEOUT_MS,
                url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({
                    system_instruction: { parts: [{ text: buildFinalPrompt() }] },
                    contents: [{ parts: [{ text: contextBlock }] }],
                    // v4.1: 기존 v4.0 설정 유지. 단, 빈 응답이면 원인을 표시합니다.
                    generationConfig: { temperature: 0.7, thinkingConfig: { thinkingLevel: 'Low' } },
                }),
                onload(res) {
                    try {
                        let data = {};
                        try { data = JSON.parse(res.responseText || '{}'); }
                        catch {
                            reject(new Error(`Gemini 응답 JSON 파싱 실패. HTTP ${res.status}: ${(res.responseText || '(empty)').slice(0, 800)}`));
                            return;
                        }

                        console.log('[초월 교정기 Gemini raw v4.1]', {
                            status: res.status,
                            statusText: res.statusText,
                            model: modelId,
                            response: data,
                        });

                        if (res.status < 200 || res.status >= 300) {
                            reject(new Error(data?.error?.message || `Gemini API 오류 HTTP ${res.status}: ${(res.responseText || '(empty)').slice(0, 800)}`));
                            return;
                        }
                        if (data.error) {
                            reject(new Error(data.error.message || safeStringify(data.error)));
                            return;
                        }

                        const blockReason = data.promptFeedback?.blockReason;
                        if (blockReason) {
                            reject(new Error(`Gemini 프롬프트 차단됨: ${blockReason}\n${safeStringify(data.promptFeedback?.safetyRatings || [])}`));
                            return;
                        }

                        const candidate = data.candidates?.[0];
                        const finishReason = candidate?.finishReason || 'unknown';
                        const raw = getGeminiTextFromCandidate(candidate);

                        if (!raw.trim()) {
                            reject(new Error(
                                `Gemini 응답 본문이 비어 있습니다.\n` +
                                `finishReason=${finishReason}\n` +
                                `promptFeedback=${safeStringify(data.promptFeedback || null, 900)}\n` +
                                `candidate=${safeStringify(candidate || null, 1200)}\n\n` +
                                `브라우저 개발자도구 Console의 [초월 교정기 Gemini raw v4.1] 로그를 확인해주세요.`
                            ));
                            return;
                        }

                        const cleaned = stripOuterFence(raw);
                        const restored = restoreProtectedBlocks(cleaned, protectedBlocks);
                        resolve(restored);
                    } catch (e) { reject(e); }
                },
                ontimeout() { reject(new Error(`Gemini 요청 시간이 초과되었습니다. timeout=${GEMINI_TIMEOUT_MS}ms`)); },
                onerror(err) { reject(new Error(`Gemini 네트워크 오류가 발생했습니다: ${err?.error || 'unknown'}`)); },
            });
        });
    }

    async function callGemini(text, overrideModel = null, userContext = '') {
        let lastErr = null;
        for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
            try {
                if (attempt > 0) setStatus(`② Gemini 재시도 중… (${attempt}/${GEMINI_MAX_RETRIES})`, 'info');
                return await callGeminiOnce(text, overrideModel, userContext);
            } catch (err) {
                lastErr = err;
                console.warn(`[초월 교정기 Gemini retry ${attempt}/${GEMINI_MAX_RETRIES}]`, err);
                if (attempt >= GEMINI_MAX_RETRIES || !shouldRetryGeminiError(err)) break;
                await sleep(GEMINI_RETRY_BASE_DELAY_MS * (attempt + 1));
            }
        }
        throw lastErr;
    }

    function callDeepSeek(text, overrideModel = null, userContext = '') {
        return new Promise((resolve, reject) => {
            const apiKey = GM_getValue('deepSeekApiKey', '').trim();
            if (!apiKey) { reject(new Error('DeepSeek API 키가 설정되지 않았습니다.')); return; }
            const modelId = overrideModel || GM_getValue('deepSeekModel', DEFAULT_DEEPSEEK_MODEL);
            const endpoint = GM_getValue('deepSeekEndpoint', DEFAULT_DEEPSEEK_ENDPOINT).trim() || DEFAULT_DEEPSEEK_ENDPOINT;
            const reasoningEffort = GM_getValue('deepSeekReasoningEffort', 'disabled');
            const thinkingEnabled = reasoningEffort !== 'disabled';
            const maxTokens = reasoningEffort === 'max' ? 32768 : 8192;
            const { contextBlock, protectedBlocks } = buildCorrectionInput(text, userContext);
            GM_xmlhttpRequest({
                method: 'POST', timeout: 120000, url: endpoint,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                data: JSON.stringify({ model: modelId, messages: [{ role: 'system', content: buildFinalPrompt() }, { role: 'user', content: contextBlock }], thinking: { type: thinkingEnabled ? 'enabled' : 'disabled' }, ...(thinkingEnabled ? { reasoning_effort: reasoningEffort } : {}), max_tokens: maxTokens, stream: false }),
                onload(res) {
                    try {
                        const data = JSON.parse(res.responseText || '{}');
                        if (res.status < 200 || res.status >= 300) { reject(new Error(data?.error?.message || `DeepSeek API 오류 ${res.status}`)); return; }
                        if (data.error) { reject(new Error(data.error.message)); return; }
                        const choice = data.choices?.[0];
                        const raw = choice?.message?.content ?? '';
                        if (!raw) { reject(new Error(`DeepSeek 응답 본문이 비어 있습니다. finish_reason=${choice?.finish_reason || 'unknown'}.`)); return; }
                        resolve(restoreProtectedBlocks(stripOuterFence(raw), protectedBlocks));
                    } catch (e) { reject(e); }
                },
                ontimeout() { reject(new Error('DeepSeek 요청 시간이 초과되었습니다.')); },
                onerror() { reject(new Error('DeepSeek 네트워크 오류가 발생했습니다.')); },
            });
        });
    }

    function callOpenRouter(text, overrideModel = null, userContext = '') {
        return new Promise((resolve, reject) => {
            const apiKey = GM_getValue('openRouterApiKey', '').trim();
            if (!apiKey) { reject(new Error('OpenRouter API 키가 설정되지 않았습니다.')); return; }
            const modelId = overrideModel || GM_getValue('openRouterModel', DEFAULT_OPENROUTER_MODEL);
            const reasoningEffort = GM_getValue('openRouterReasoningEffort', 'none');
            const providerRouting = getOpenRouterProviderRouting();
            const { contextBlock, protectedBlocks } = buildCorrectionInput(text, userContext);
            GM_xmlhttpRequest({
                method: 'POST', timeout: 120000, url: DEFAULT_OPENROUTER_ENDPOINT,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': 'https://babechat.ai/', 'X-Title': 'Babechat Transcendent Corrector' },
                data: JSON.stringify({ model: modelId, messages: [{ role: 'system', content: buildFinalPrompt() }, { role: 'user', content: contextBlock }], temperature: 0.7, reasoning: { effort: reasoningEffort, exclude: true }, ...(providerRouting ? { provider: providerRouting } : {}), stream: false }),
                onload(res) {
                    try {
                        const data = JSON.parse(res.responseText || '{}');
                        if (res.status < 200 || res.status >= 300) { reject(new Error(data?.error?.message || `OpenRouter API 오류 ${res.status}`)); return; }
                        if (data.error) { reject(new Error(data.error.message)); return; }
                        const choice = data.choices?.[0];
                        const raw = choice?.message?.content ?? '';
                        if (!raw) { reject(new Error(`OpenRouter 응답 본문이 비어 있습니다. finish_reason=${choice?.finish_reason || 'unknown'}.`)); return; }
                        resolve(restoreProtectedBlocks(stripOuterFence(raw), protectedBlocks));
                    } catch (e) { reject(e); }
                },
                ontimeout() { reject(new Error('OpenRouter 요청 시간이 초과되었습니다.')); },
                onerror() { reject(new Error('OpenRouter 네트워크 오류가 발생했습니다.')); },
            });
        });
    }

    function callCorrection(text, overrideModel = null, userContext = '', provider = GM_getValue('apiProvider', 'gemini')) {
        if (provider === 'deepseek') return callDeepSeek(text, overrideModel, userContext);
        if (provider === 'openrouter') return callOpenRouter(text, overrideModel, userContext);
        return callGemini(text, overrideModel, userContext);
    }

    // =============================================
    //  elyn.ai UI 자동화
    // =============================================
    function isVisible(el) {
        if (!el || !el.isConnected) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }
    function isOwnUiElement(el) { return !!el?.closest?.('#trans-setting-panel, #trans-result-modal, #trans-result-overlay, #trans-toast, .trans-inline-correct-btn, .trans-inline-settings-btn, .trans-inline-panel'); }
    function findLastUserMessage() {
        const bubbles = Array.from(document.querySelectorAll('div.whitespace-pre-line.break-words.text-white'))
            .filter(el => isVisible(el) && (String(el.className || '').includes('bg-[#B56576]') || !!el.closest('.bg-\\[\\#B56576\\]')));
        const last = bubbles[bubbles.length - 1];
        return last ? last.textContent.trim() : '';
    }
    let activeTargetRoot = null;
    let activePencilBtn = null;
    let inlineRootSeq = 0;
    const inlineRootMap = new Map();
    const inlinePencilMap = new Map();
    function getOrAssignInlineRootId(root) {
        if (!root) return '';
        if (!root.dataset.transRootId) root.dataset.transRootId = `trans-root-${++inlineRootSeq}`;
        inlineRootMap.set(root.dataset.transRootId, root);
        return root.dataset.transRootId;
    }
    function getInlineRootById(id) {
        const root = id ? inlineRootMap.get(id) : null;
        return root?.isConnected ? root : null;
    }
    function getInlinePencilById(id) {
        const btn = id ? inlinePencilMap.get(id) : null;
        return btn?.isConnected && isVisible(btn) ? btn : null;
    }
    function findLastAssistantMessageRoot() {
        if (activeTargetRoot?.isConnected && isVisible(activeTargetRoot)) return activeTargetRoot;
        const roots = Array.from(document.querySelectorAll('div.flex.w-full.flex-col.gap-2.rounded-r-xl.rounded-bl-xl.bg-\\[\\#262727\\]'))
            .filter(el => isVisible(el) && !isOwnUiElement(el));
        return roots[roots.length - 1] || null;
    }
    function findMessageRoot(el) {
        return el?.closest?.('form, div.flex.w-full.flex-col.gap-2.rounded-r-xl.rounded-bl-xl.bg-\\[\\#262727\\]') || null;
    }
    function getPreviewHost(editArea = null, fallbackRoot = null) {
        return findMessageRoot(editArea) || (fallbackRoot?.isConnected ? fallbackRoot : null) || document.querySelector('div.flex.flex-col.gap-3.px-5');
    }
    function setInlineRunStatus(host, message) {
        if (!host) return;
        let status = host.querySelector(':scope > .trans-inline-run-status');
        if (!status) {
            status = document.createElement('div');
            status.className = 'trans-inline-run-status';
            host.appendChild(status);
        }
        status.textContent = message;
    }
    function findLastPencilBtn() {
        if (activePencilBtn?.isConnected && isVisible(activePencilBtn)) return activePencilBtn;
        const root = findLastAssistantMessageRoot() || document;
        const pencilBtns = Array.from(root.querySelectorAll('button')).filter(btn => {
            if (!isVisible(btn) || btn.disabled || isOwnUiElement(btn)) return false;
            return !!btn.querySelector('svg[viewBox="0 0 20 20"] path[d^="M9.944 6.983"]');
        });
        return pencilBtns[pencilBtns.length - 1] || null;
    }
    function findPencilBtnIn(scope) {
        return Array.from(scope?.querySelectorAll?.('button') || []).find(btn => {
            if (!isVisible(btn) || btn.disabled || isOwnUiElement(btn)) return false;
            return !!btn.querySelector('svg[viewBox="0 0 20 20"] path[d^="M9.944 6.983"]');
        }) || null;
    }
    function findEditArea() {
        const candidates = Array.from(document.querySelectorAll('textarea[name="message"]')).filter(el => isVisible(el));
        return candidates[candidates.length - 1] || null;
    }
    async function waitForElement(getter, timeout = 2500, interval = 100) {
        const started = Date.now(); let found = getter();
        while (!found && Date.now() - started < timeout) { await sleep(interval); found = getter(); }
        return found;
    }
    function getButtonLabel(btn) { return [btn.textContent, btn.getAttribute('aria-label'), btn.getAttribute('title')].filter(Boolean).join(' '); }
    function isSaveLikeButton(btn) {
        const label = getButtonLabel(btn);
        const hasCheckIcon = !!btn.querySelector('svg[viewBox="0 0 448 512"] path[d^="M438.6 105.4"]');
        const hasSaveLabel = /저장|수정\s*확정|확정|완료|적용|save|done|confirm|apply/i.test(label);
        const hasCancelLabel = /취소|닫기|cancel|close/i.test(label);
        return !hasCancelLabel && (hasCheckIcon || hasSaveLabel);
    }
    function isCancelLikeButton(btn) {
        const label = getButtonLabel(btn);
        const hasXIcon = !!btn.querySelector('svg[viewBox="0 0 384 512"] path[d^="M342.6 150.6"]');
        return hasXIcon || /취소|닫기|cancel|close/i.test(label);
    }
    function findSaveBtn(scopeEl = null, tried = new Set()) {
        const scopes = [];
        const messageRoot = findMessageRoot(scopeEl);
        if (messageRoot) scopes.push(messageRoot);
        scopes.push(document);
        for (const scope of scopes) {
            const buttons = Array.from(scope.querySelectorAll('button')).filter(btn => isVisible(btn) && !btn.disabled && !isOwnUiElement(btn) && !tried.has(btn));
            const found = buttons.find(isSaveLikeButton); if (found) return found;
        }
        return null;
    }
    function findCancelBtn(scopeEl = null) {
        const messageRoot = findMessageRoot(scopeEl);
        const scope = messageRoot || document;
        return Array.from(scope.querySelectorAll('button')).find(btn => isVisible(btn) && !btn.disabled && !isOwnUiElement(btn) && isCancelLikeButton(btn)) || null;
    }
    function isEditStillOpen(editArea) { return !!editArea?.isConnected && editArea.tagName === 'TEXTAREA' && isVisible(editArea); }
    async function waitForEditClosed(editArea, timeout = 1500, interval = 100) {
        const started = Date.now();
        while (Date.now() - started < timeout) { if (!isEditStillOpen(editArea)) return true; await sleep(interval); }
        return !isEditStillOpen(editArea);
    }
    async function cancelEditMode(editArea) {
        const cancelBtn = findCancelBtn(editArea);
        if (cancelBtn) { cancelBtn.click(); await waitForEditClosed(editArea, 1000, 100); return; }
        editArea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await sleep(400);
    }
    async function confirmEditedMessage(editArea) {
        const tried = new Set();
        for (let attempt = 0; attempt < 4; attempt++) {
            const saveBtn = await waitForElement(() => findSaveBtn(editArea, tried), 1500, 100);
            if (!saveBtn) break;
            tried.add(saveBtn); saveBtn.click();
            if (await waitForEditClosed(editArea)) return;
            await sleep(250);
        }
        throw new Error('교정본은 입력했지만 수정 확정 버튼을 누르지 못했습니다. babechat.ai 버튼 구조가 바뀐 것 같습니다.');
    }
    function getEditableText(el) { return el?.tagName === 'TEXTAREA' ? el.value : el?.innerText || ''; }
    function normalizeEditableText(text) { return (text || '').replace(/\r\n/g, '\n').trim(); }
    function fireEditableEvents(el, text, inputType = 'insertText') {
        el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType, data: text }));
        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType, data: text }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true }));
    }
    function setEditableContent(el, text) {
        el.focus();
        if (el.tagName === 'TEXTAREA') {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
            if (nativeInputValueSetter) nativeInputValueSetter.call(el, text);
            else el.value = text;
            fireEditableEvents(el, text, 'insertFromPaste');
            return normalizeEditableText(el.value) === normalizeEditableText(text);
        }
        const selection = window.getSelection(); const range = document.createRange();
        range.selectNodeContents(el); selection.removeAllRanges(); selection.addRange(range);
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
        fireEditableEvents(el, text, 'insertText');
        if (normalizeEditableText(el.innerText) !== normalizeEditableText(text)) { el.textContent = text; fireEditableEvents(el, text, 'insertFromPaste'); }
        return normalizeEditableText(el.innerText) === normalizeEditableText(text);
    }
    async function applyTranslation(translated) {
        let editArea = findEditArea();
        if (!editArea) {
            const pencilBtn = findLastPencilBtn();
            if (!pencilBtn) throw new Error('AI 메시지의 수정 버튼을 찾을 수 없습니다. 마우스를 AI 메시지 위에 올려 두세요.');
            pencilBtn.click(); editArea = await waitForElement(findEditArea);
        }
        if (!editArea) throw new Error('편집창을 찾을 수 없습니다.');
        let inserted = setEditableContent(editArea, translated);
        await sleep(250);
        if (!inserted || normalizeEditableText(getEditableText(editArea)) !== normalizeEditableText(translated)) { inserted = setEditableContent(editArea, translated); await sleep(250); }
        if (!inserted || normalizeEditableText(getEditableText(editArea)) !== normalizeEditableText(translated)) throw new Error('교정본을 편집창에 넣지 못했습니다. babechat.ai 편집창 구조가 바뀐 것 같습니다.');
        await confirmEditedMessage(editArea); await sleep(600);
    }

    function findActionBar(root) {
        return root?.querySelector?.('[data-capture-ignore="true"] .flex.items-center.gap-3') ||
            root?.querySelector?.('[data-capture-ignore="true"]') ||
            null;
    }
    function createInlineButton(className, text, title) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = className;
        btn.textContent = text;
        btn.title = title;
        btn.setAttribute('aria-label', title);
        return btn;
    }
    function getInlineActionRoot(el) {
        const byId = getInlineRootById(el?.dataset?.transRootId);
        if (byId) return byId;
        return el?.closest?.('div.flex.w-full.flex-col.gap-2.rounded-r-xl.rounded-bl-xl.bg-\\[\\#262727\\]') || null;
    }
    function getInlineActionBar(el) {
        return el?.closest?.('[data-capture-ignore="true"] .flex.items-center.gap-3') ||
            el?.closest?.('[data-capture-ignore="true"]') ||
            null;
    }
    function guardInlineButtonEvent(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
    }
    function bindInlineButton(btn, handler) {
        // Inline actions are handled only by the document-level capture listener.
        // Mobile Firefox can emit touch/pointer/click sequences that double-run
        // per-button handlers and leave the active edit target one response behind.
    }
    function openSettingsPanel() {
        bringUserscriptUiToFront();
        panel.style.setProperty('display', panel.style.display === 'block' ? 'none' : 'block', 'important');
        if (panel.style.display === 'block') {
            panel.style.setProperty('position', 'fixed', 'important');
            panel.style.setProperty('top', '50%', 'important');
            panel.style.setProperty('left', '50%', 'important');
            panel.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
            panel.style.setProperty('z-index', '2147483647', 'important');
            clearStatus();
        }
    }
    function openPromptSettings() {
        const currentProvider = prompt('API 공급자를 입력하세요: gemini / deepseek / openrouter', providerSelect.value || 'gemini');
        if (!currentProvider) return;
        const provider = ['gemini', 'deepseek', 'openrouter'].includes(currentProvider.trim().toLowerCase())
            ? currentProvider.trim().toLowerCase()
            : 'gemini';
        const currentKey = getSavedApiKey(provider);
        const apiKey = prompt(`${getProviderDisplayName(provider)} API 키를 입력하세요`, currentKey || '');
        if (apiKey === null) return;
        providerSelect.value = provider;
        apiKeyInput.value = apiKey.trim();
        saveProviderFields(provider);
        GM_setValue('apiProvider', provider);
        loadProviderFields(provider);
        showToast(`${getProviderDisplayName(provider)} API 키 저장 완료`, 2500);
    }
    function setInlineStatus(panelEl, message) {
        const status = panelEl?.querySelector?.('.trans-inline-status');
        if (!status) return;
        status.textContent = message || '';
        status.classList.toggle('trans-show', !!message);
    }
    function syncInlineProviderFields(panelEl) {
        const provider = panelEl.querySelector('.trans-inline-provider')?.value || 'gemini';
        panelEl.querySelectorAll('[data-provider-fields]').forEach(el => {
            el.style.display = el.getAttribute('data-provider-fields') === provider ? '' : 'none';
        });
        const apiKey = panelEl.querySelector('.trans-inline-api-key');
        const model = panelEl.querySelector('.trans-inline-model');
        if (apiKey) apiKey.placeholder = `${getProviderDisplayName(provider)} API 키`;
        if (model) model.placeholder = `예: ${getDefaultModel(provider)}`;
    }
    function populateInlineSettings(panelEl) {
        const provider = GM_getValue('apiProvider', providerSelect.value || 'gemini');
        panelEl.querySelector('.trans-inline-provider').value = provider;
        panelEl.querySelector('.trans-inline-api-key').value = getSavedApiKey(provider);
        panelEl.querySelector('.trans-inline-model').value = getSavedModel(provider);
        panelEl.querySelector('.trans-inline-auto-replace').value = GM_getValue('showPreview', true) ? 'preview' : 'replace';
        panelEl.querySelector('.trans-inline-prompt').value = GM_getValue('customPrompt', baseSystemPrompt);
        panelEl.querySelector('.trans-inline-deepseek-endpoint').value = GM_getValue('deepSeekEndpoint', DEFAULT_DEEPSEEK_ENDPOINT);
        panelEl.querySelector('.trans-inline-deepseek-reasoning').value = GM_getValue('deepSeekReasoningEffort', 'disabled');
        panelEl.querySelector('.trans-inline-openrouter-reasoning').value = GM_getValue('openRouterReasoningEffort', 'none');
        panelEl.querySelector('.trans-inline-openrouter-provider').value = GM_getValue('openRouterProvider', '');
        syncInlineProviderFields(panelEl);
        setInlineStatus(panelEl, '');
    }
    function saveInlineSettings(panelEl) {
        try {
            const provider = panelEl.querySelector('.trans-inline-provider').value || 'gemini';
            const rawModel = panelEl.querySelector('.trans-inline-model').value.trim() || getDefaultModel(provider);
            const model = provider === 'gemini' ? normalizeGeminiModel(rawModel) : rawModel;
            GM_setValue('apiProvider', provider);
            GM_setValue(getApiKeyStorageKey(provider), panelEl.querySelector('.trans-inline-api-key').value.trim());
            GM_setValue(getModelStorageKey(provider), model);
            GM_setValue('showPreview', panelEl.querySelector('.trans-inline-auto-replace').value !== 'replace');
            GM_setValue('promptMode', 'custom');
            GM_setValue('customPrompt', panelEl.querySelector('.trans-inline-prompt').value);
            GM_setValue('deepSeekEndpoint', panelEl.querySelector('.trans-inline-deepseek-endpoint').value.trim() || DEFAULT_DEEPSEEK_ENDPOINT);
            GM_setValue('deepSeekReasoningEffort', panelEl.querySelector('.trans-inline-deepseek-reasoning').value);
            GM_setValue('openRouterReasoningEffort', panelEl.querySelector('.trans-inline-openrouter-reasoning').value);
            GM_setValue('openRouterProvider', panelEl.querySelector('.trans-inline-openrouter-provider').value.trim());

            providerSelect.value = provider;
            loadProviderFields(provider);
            customPromptInput.value = GM_getValue('customPrompt', baseSystemPrompt);
            setAutoReplaceEnabled(!GM_getValue('showPreview', true));
            setInlineStatus(panelEl, '저장 완료');
            showToast('설정 저장 완료', 1800);
        } catch (err) {
            console.error('[초월 교정기 babechat inline save]', err);
            setInlineStatus(panelEl, `저장 실패: ${err?.message || err}`);
            alert(`저장 실패: ${err?.message || err}`);
        }
    }
    function createInlineSettingsPanel() {
        const wrapper = document.createElement('div');
        wrapper.className = 'trans-inline-panel';
        wrapper.innerHTML = `
            <div class="trans-inline-grid">
                <div class="trans-inline-field">
                    <label>API 공급자</label>
                    <select class="trans-inline-provider">
                        <option value="gemini">Gemini</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="openrouter">OpenRouter</option>
                    </select>
                </div>
                <div class="trans-inline-field">
                    <label>자동 교체</label>
                    <select class="trans-inline-auto-replace">
                        <option value="preview">미리보기</option>
                        <option value="replace">바로 교체</option>
                    </select>
                </div>
                <div class="trans-inline-field full">
                    <label>API 키</label>
                    <input class="trans-inline-api-key" type="password" autocomplete="off">
                </div>
                <div class="trans-inline-field full">
                    <label>모델명</label>
                    <input class="trans-inline-model" type="text" autocomplete="off">
                </div>
                <div class="trans-inline-field full" data-provider-fields="deepseek">
                    <label>DeepSeek API 주소</label>
                    <input class="trans-inline-deepseek-endpoint" type="text" autocomplete="off">
                </div>
                <div class="trans-inline-field" data-provider-fields="deepseek">
                    <label>DeepSeek 추론 강도</label>
                    <select class="trans-inline-deepseek-reasoning">
                        <option value="disabled">Disabled</option>
                        <option value="high">High</option>
                        <option value="max">MAX</option>
                    </select>
                </div>
                <div class="trans-inline-field" data-provider-fields="openrouter">
                    <label>OpenRouter 추론 강도</label>
                    <select class="trans-inline-openrouter-reasoning">
                        <option value="none">None</option>
                        <option value="minimal">Minimal</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="xhigh">XHigh</option>
                    </select>
                </div>
                <div class="trans-inline-field full" data-provider-fields="openrouter">
                    <label>OpenRouter 공급자 슬러그</label>
                    <input class="trans-inline-openrouter-provider" type="text" placeholder="예: siliconflow 또는 siliconflow, deepinfra">
                </div>
                <div class="trans-inline-field full">
                    <label>교정 프롬프트</label>
                    <textarea class="trans-inline-prompt"></textarea>
                </div>
            </div>
            <div class="trans-inline-actions">
                <button type="button" class="trans-inline-action trans-inline-save">저장</button>
                <button type="button" class="trans-inline-action trans-inline-reset">기본 프롬프트</button>
                <button type="button" class="trans-inline-action trans-inline-close">닫기</button>
            </div>
            <div class="trans-inline-status"></div>
        `;
        const stopPanelBubble = (e) => { e.stopPropagation(); };
        ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(type => {
            wrapper.addEventListener(type, stopPanelBubble, { passive: false });
        });
        wrapper.querySelector('.trans-inline-provider').addEventListener('change', () => {
            const provider = wrapper.querySelector('.trans-inline-provider').value;
            wrapper.querySelector('.trans-inline-api-key').value = getSavedApiKey(provider);
            wrapper.querySelector('.trans-inline-model').value = getSavedModel(provider);
            syncInlineProviderFields(wrapper);
        });
        wrapper.querySelector('.trans-inline-save').addEventListener('click', e => {
            guardInlineButtonEvent(e);
            saveInlineSettings(wrapper);
        });
        wrapper.querySelector('.trans-inline-reset').addEventListener('click', e => {
            guardInlineButtonEvent(e);
            wrapper.querySelector('.trans-inline-prompt').value = baseSystemPrompt;
            setInlineStatus(wrapper, '기본 프롬프트로 되돌렸습니다. 저장을 눌러 적용하세요.');
        });
        wrapper.querySelector('.trans-inline-close').addEventListener('click', e => {
            guardInlineButtonEvent(e);
            wrapper.classList.remove('trans-open');
        });
        populateInlineSettings(wrapper);
        return wrapper;
    }
    function toggleInlineSettings(root) {
        if (!root) return openPromptSettings();
        let panelEl = root.querySelector('.trans-inline-panel');
        if (!panelEl) {
            panelEl = createInlineSettingsPanel();
            root.appendChild(panelEl);
        }
        populateInlineSettings(panelEl);
        panelEl.classList.toggle('trans-open');
        if (panelEl.classList.contains('trans-open')) panelEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function closeInlinePreview(root, editArea = null) {
        root?.querySelector?.('.trans-inline-preview')?.remove();
        if (editArea && isEditStillOpen(editArea)) cancelEditMode(editArea);
    }
    function showInlinePreview(root, corrected, editArea) {
        if (!root) return false;
        root.querySelector('.trans-inline-preview')?.remove();
        root.querySelector(':scope > .trans-inline-run-status')?.remove();
        const preview = document.createElement('div');
        preview.className = 'trans-inline-preview';
        preview.innerHTML = `
            <div class="trans-inline-preview-title">교정 결과 미리보기</div>
            <div class="trans-inline-preview-content"></div>
            <div class="trans-inline-preview-actions">
                <button type="button" class="trans-inline-preview-action trans-inline-apply">이 결과로 교체</button>
                <button type="button" class="trans-inline-preview-action trans-inline-preview-close">닫기</button>
            </div>
        `;
        preview.querySelector('.trans-inline-preview-content').textContent = corrected;
        preview.addEventListener('click', e => e.stopPropagation());
        preview.addEventListener('pointerdown', e => e.stopPropagation());
        preview.querySelector('.trans-inline-apply').addEventListener('click', async (e) => {
            guardInlineButtonEvent(e);
            try {
                let area = editArea;
                if (!area || !isEditStillOpen(area)) {
                    activeTargetRoot = root;
                    const pencilBtn = findLastPencilBtn();
                    if (!pencilBtn) throw new Error('수정 버튼을 다시 찾을 수 없습니다.');
                    pencilBtn.click();
                    area = await waitForElement(findEditArea);
                }
                if (!area) throw new Error('편집창을 찾을 수 없습니다.');
                const inserted = setEditableContent(area, corrected);
                await sleep(250);
                if (!inserted || normalizeEditableText(getEditableText(area)) !== normalizeEditableText(corrected)) {
                    throw new Error('교정본을 편집창에 넣지 못했습니다.');
                }
                await confirmEditedMessage(area);
                preview.remove();
                showToast('교정 교체 완료', 1800);
            } catch (err) {
                console.error('[초월 교정기 babechat inline apply]', err);
                alert(err?.message || String(err));
            } finally {
                activeTargetRoot = null;
                activePencilBtn = null;
            }
        });
        preview.querySelector('.trans-inline-preview-close').addEventListener('click', (e) => {
            guardInlineButtonEvent(e);
            closeInlinePreview(root, editArea);
            activeTargetRoot = null;
            activePencilBtn = null;
        });
        root.appendChild(preview);
        preview.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return true;
    }
    let lastDelegatedInlineAt = 0;
    function handleInlineAction(action, target) {
        const now = Date.now();
        if (now - lastDelegatedInlineAt < 900) return;
        lastDelegatedInlineAt = now;
        if (action === 'correct' && target.dataset.transBusy === '1') return;
        activePencilBtn = null;
        activeTargetRoot = getInlineActionRoot(target) || activeTargetRoot;
        activePencilBtn = getInlinePencilById(target?.dataset?.transRootId) ||
            findPencilBtnIn(getInlineActionBar(target)) ||
            findPencilBtnIn(activeTargetRoot);
        if (!activeTargetRoot?.isConnected) {
            alert('교정할 답변 위치를 찾지 못했습니다. 해당 답변 아래의 교정 버튼을 다시 눌러주세요.');
            return;
        }
        if (action === 'correct' && (!activePencilBtn?.isConnected || !isVisible(activePencilBtn))) {
            alert('이 답변의 수정 버튼을 찾지 못했습니다. 해당 답변 위에 마우스를 올린 뒤 다시 눌러주세요.');
            return;
        }
        if (action === 'correct') {
            target.dataset.transBusy = '1';
            target.textContent = '시작';
            setTimeout(() => { if (target.isConnected && target.dataset.transBusy !== '1') target.textContent = '교정'; }, 1200);
            showToast('교정 시작', 1800);
            autoCorrect().catch(err => {
                console.error('[초월 교정기 babechat inline]', err);
                alert(err?.message || String(err));
            }).finally(() => {
                delete target.dataset.transBusy;
                if (target.isConnected) target.textContent = '교정';
            });
            return;
        }
        if (action === 'settings') {
            toggleInlineSettings(activeTargetRoot);
        }
    }
    function injectInlineButtons() {
        const roots = Array.from(document.querySelectorAll('div.flex.w-full.flex-col.gap-2.rounded-r-xl.rounded-bl-xl.bg-\\[\\#262727\\]'))
            .filter(el => isVisible(el) && !isOwnUiElement(el));
        for (const root of roots) {
            const rootId = getOrAssignInlineRootId(root);
            const actionBar = findActionBar(root);
            if (!actionBar) continue;
            const pencilBtn = findPencilBtnIn(actionBar);
            if (!pencilBtn) continue;
            inlinePencilMap.set(rootId, pencilBtn);
            const existingCorrectBtn = actionBar.querySelector('.trans-inline-correct-btn');
            const existingSettingsBtn = actionBar.querySelector('.trans-inline-settings-btn');
            if (existingCorrectBtn) existingCorrectBtn.dataset.transRootId = rootId;
            if (existingSettingsBtn) existingSettingsBtn.dataset.transRootId = rootId;
            if (existingCorrectBtn && existingSettingsBtn) continue;

            const correctBtn = createInlineButton('trans-inline-correct-btn', '교정', '이 답변 교정');
            correctBtn.dataset.transAction = 'correct';
            correctBtn.dataset.transRootId = rootId;
            bindInlineButton(correctBtn, () => {
                activeTargetRoot = root;
                activePencilBtn = pencilBtn;
                showToast('교정 시작');
                autoCorrect().catch(err => {
                    console.error('[초월 교정기 babechat inline]', err);
                    alert(err?.message || String(err));
                });
            });

            const settingsInlineBtn = createInlineButton('trans-inline-settings-btn', '설정', '초월 교정 설정');
            settingsInlineBtn.dataset.transAction = 'settings';
            settingsInlineBtn.dataset.transRootId = rootId;
            bindInlineButton(settingsInlineBtn, () => {
                activeTargetRoot = root;
                activePencilBtn = pencilBtn;
                toggleInlineSettings(root);
            });

            actionBar.appendChild(correctBtn);
            actionBar.appendChild(settingsInlineBtn);
        }
    }

    // =============================================
    //  모달 상태 관리
    // =============================================
    let transHistory = [], transIndex = -1, activeOriginalText = '', activeUserContext = '', activeApiProvider = GM_getValue('apiProvider', 'gemini');
    const updateModalState = () => {
        if (!transHistory.length) return;
        resultContent.innerText = transHistory[transIndex];
        historyCount.innerText = `${transIndex + 1} / ${transHistory.length}`;
        prevBtn.disabled = transIndex === 0; nextBtn.disabled = transIndex === transHistory.length - 1;
    };
    const closeResultModal = () => { overlay.style.display = 'none'; resultModal.style.display = 'none'; panel.style.display = 'none'; clearStatus(); };
    closeModalBtn.addEventListener('click', closeResultModal);
    overlay.addEventListener('click', closeResultModal);
    prevBtn.addEventListener('click', () => { if (transIndex > 0) { transIndex--; updateModalState(); } });
    nextBtn.addEventListener('click', () => { if (transIndex < transHistory.length - 1) { transIndex++; updateModalState(); } });
    rerollBtn.addEventListener('click', async () => {
        try {
            rerollBtn.innerText = '재생성 중… ⏳'; rerollBtn.disabled = true;
            const newResult = await callCorrection(activeOriginalText, modalModelSelect.value, activeUserContext, activeApiProvider);
            transHistory.push(newResult); transIndex = transHistory.length - 1; updateModalState();
        } catch (e) { alert(e.message); }
        finally { rerollBtn.innerText = '다시 돌리기'; rerollBtn.disabled = false; }
    });
    patchModalBtn.addEventListener('click', async () => {
        if (!transHistory.length) return;
        try {
            patchModalBtn.innerText = '교체 중… ⏳'; patchModalBtn.disabled = true;
            await applyTranslation(transHistory[transIndex]);
            patchModalBtn.innerText = '교체 완료! ✔️';
            setTimeout(() => { closeResultModal(); patchModalBtn.disabled = false; patchModalBtn.innerText = '이 결과로 교체하기'; }, 2000);
        } catch (e) { alert(e.message); patchModalBtn.innerText = '이 결과로 교체하기'; patchModalBtn.disabled = false; }
    });

    // =============================================
    //  메인 교정 로직
    // =============================================
    async function autoCorrect(options = {}) {
        const forceAutoReplace = options?.forceAutoReplace === true;
        const requestedRoot = activeTargetRoot;
        if (!isChattingPage()) { showToast('채팅방 페이지에서만 사용 가능합니다.'); return; }
        const currentProvider = providerSelect.value || 'gemini';
        saveProviderFields(currentProvider);
        GM_setValue('apiProvider', currentProvider);
        GM_setValue('showPreview', autoReplaceToggle.getAttribute('aria-checked') !== 'true');
        GM_setValue('promptMode', 'custom');
        GM_setValue('customPrompt', customPromptInput.value);
        activeApiProvider = currentProvider;

        if (!getSavedApiKey(currentProvider).trim()) {
            const msg = `${getProviderDisplayName(currentProvider)} API 키가 설정되지 않았습니다. 설정 버튼에서 입력 후 저장해주세요.`;
            setStatus(msg, 'err');
            showToast(msg, 4500);
            if (activeTargetRoot?.isConnected) toggleInlineSettings(activeTargetRoot);
            else openSettingsPanel();
            return;
        }
        translateBtn.disabled = true; quickBtn.disabled = true; clearStatus();

        try {
            setStatus('① 편집 모드 진입 중…', 'info');
            const pencilBtn = findLastPencilBtn();
            if (!pencilBtn) throw new Error('AI 메시지의 수정 버튼을 찾을 수 없습니다. 마우스를 AI 메시지 위에 올려 두세요.');
            const userContext = findLastUserMessage();
            pencilBtn.click();
            const editArea = await waitForElement(findEditArea);
            if (!editArea) throw new Error('편집창이 열리지 않았습니다. 잠시 후 다시 시도해주세요.');
            const previewHost = getPreviewHost(editArea, requestedRoot);
            setInlineRunStatus(previewHost, '원문을 읽었습니다. 교정 요청 중...');
            const original = getEditableText(editArea).trim();
            if (!original) throw new Error('교정할 내용이 없습니다.');
            activeOriginalText = original; activeUserContext = userContext;

            const usePreview = !forceAutoReplace && autoReplaceToggle.getAttribute('aria-checked') !== 'true';
            if (usePreview) {
                setStatus('② 교정 중… (Gemini는 실패 시 자동 재시도합니다)', 'info');
                setInlineRunStatus(previewHost, '교정 중... API 응답을 기다리고 있습니다.');
                const corrected = await callCorrection(original, null, userContext, currentProvider);
                transHistory = [corrected]; transIndex = 0; modalModelSelect.value = getSavedModel(currentProvider);
                const finalPreviewHost = getPreviewHost(editArea, previewHost || requestedRoot);
                if (showInlinePreview(finalPreviewHost, corrected, editArea)) {
                    setStatus('미리보기를 답변 아래에 표시했습니다.', 'ok');
                    showToast('교정 결과 도착', 1800);
                } else {
                    setInlineRunStatus(previewHost, '교정 결과는 도착했지만 미리보기를 붙일 위치를 찾지 못했습니다.');
                    alert('교정 결과는 도착했지만 미리보기를 붙일 위치를 찾지 못했습니다.');
                }
            } else {
                setStatus('② 교정 중… (Gemini는 실패 시 자동 재시도합니다)', 'info');
                setInlineRunStatus(previewHost, '교정 중... API 응답을 기다리고 있습니다.');
                const corrected = await callCorrection(original, null, userContext, currentProvider);
                setStatus('③ 교정본 삽입 중…', 'info');
                setInlineRunStatus(previewHost, '교정본 삽입 중...');
                await applyTranslation(corrected);
                setStatus('✅ 교정 교체 완료!', 'ok');
                setInlineRunStatus(previewHost, '교정 교체 완료');
                setTimeout(() => { panel.style.display = 'none'; clearStatus(); }, 900);
            }
        } catch (err) {
            setStatus(`❌ ${err.message}`, 'err');
            setInlineRunStatus(getPreviewHost(null, requestedRoot), `오류: ${err.message}`);
            console.error('[초월 교정기 babechat]', err);
        } finally {
            translateBtn.disabled = false; quickBtn.disabled = false;
            activeTargetRoot = null;
            activePencilBtn = null;
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
    document.getElementById('trans-panel-close').addEventListener('click', () => { panel.style.display = 'none'; clearStatus(); });
    customPromptInput.addEventListener('input', () => { GM_setValue('promptMode', 'custom'); GM_setValue('customPrompt', customPromptInput.value); });
    autoReplaceToggle.addEventListener('click', () => { setAutoReplaceEnabled(autoReplaceToggle.getAttribute('aria-checked') !== 'true'); });
    providerSelect.addEventListener('change', () => { saveProviderFields(activeProvider); GM_setValue('apiProvider', providerSelect.value); loadProviderFields(providerSelect.value); clearStatus(); });
    resetBtn.addEventListener('click', () => { if (confirm('교정 지침서를 기본값으로 초기화할까요?')) resetCustomPrompt(); });
    saveBtn.addEventListener('click', () => {
        saveProviderFields(providerSelect.value);
        GM_setValue('apiProvider', providerSelect.value);
        GM_setValue('showPreview', autoReplaceToggle.getAttribute('aria-checked') !== 'true');
        GM_setValue('promptMode', 'custom');
        GM_setValue('customPrompt', customPromptInput.value);
        saveBtn.textContent = '저장 완료!'; setTimeout(() => { saveBtn.textContent = '저장하기'; }, 1200);
    });
    translateBtn.addEventListener('click', autoCorrect);
    quickBtn.addEventListener('click', (e) => { if (dragMoved) { e.preventDefault(); e.stopPropagation(); return; } autoCorrect({ forceAutoReplace: true }); });
    ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(type => {
        document.addEventListener(type, (e) => {
            const target = e.target?.closest?.('.trans-inline-correct-btn, .trans-inline-settings-btn');
            if (!target) return;
            guardInlineButtonEvent(e);
            handleInlineAction(target.dataset.transAction, target);
        }, { capture: true, passive: false });
    });

    // =============================================
    //  교정 버튼 표시 제어 (SPA 라우팅 대응)
    // =============================================
    function syncTranslateBtn() {
        const visible = isChattingPage();
        translateBtn.style.display = visible ? 'inline-block' : 'none';
        settingBtn.style.setProperty('display', 'none', 'important');
        settingBtn.style.setProperty('visibility', 'hidden', 'important');
        quickBtn.style.setProperty('display', 'none', 'important');
        quickBtn.style.setProperty('visibility', 'hidden', 'important');
        bringUserscriptUiToFront();
        injectInlineButtons();
        clampAllDraggableButtons();
    }
    syncTranslateBtn();
    let _lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== _lastUrl) { _lastUrl = location.href; setTimeout(syncTranslateBtn, 800); }
    }).observe(document, { subtree: true, childList: true });
    setInterval(syncTranslateBtn, 2000);
    setInterval(injectInlineButtons, 800);
    setInterval(bringUserscriptUiToFront, 500);

})();
