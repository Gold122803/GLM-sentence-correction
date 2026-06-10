// ==UserScript==
// @name         珥덉썡 援먯젙湲?Protected Context for eden-chat
// @namespace    http://tampermonkey.net/
// @version      5.2.0-protected-context
// @description  eden-chat AI 硫붿떆吏瑜?援먯젙쨌援먯껜. 肄붾뱶釉붾윮/<details>??蹂댄샇 ?좏겙?쇰줈 蹂댁〈?섍퀬 留λ씫 ?먮Ц?쇰줈 李몄“.
// @match        https://www.eden-chat.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// @connect      api.deepseek.com
// @connect      openrouter.ai
// @connect      *.googleapis.com
// ==/UserScript==

(function () {
    'use strict';

    // =============================================
    //  ?곸닔
    // =============================================
    const CODE_BLOCK_RE = /```([\s\S]*?)```/g;
    const DETAILS_BLOCK_RE = /<details\b[\s\S]*?<\/details>/gi;
    const PROTECTED_BLOCK_TOKEN_RE = /@@TC_PROTECTED_BLOCK_(\d+)@@/g;

    // v4.1: ?ъ슜?먭? 湲곗〈????ν븳 紐⑤뜽紐낆쓣 議댁쨷?⑸땲??
    // ???ㅼ튂/珥덇린???쒖뿉??湲곗〈 v4.0 湲곕낯媛믪쓣 ?좎??⑸땲??
    const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview';
    const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
    const DEFAULT_DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
    const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
    const DEFAULT_OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
    const DEFAULT_VERTEX_MODEL = 'gemini-3-flash-preview';
    const DEFAULT_VERTEX_LOCATION = 'us-central1';
    const VERTEX_TIMEOUT_MS = 120000;

    // v4.1 Gemini ?덉젙???듭뀡
    const GEMINI_TIMEOUT_MS = 120000;
    const GEMINI_MAX_RETRIES = 2;
    const GEMINI_RETRY_BASE_DELAY_MS = 1200;

    const baseSystemPrompt = `[??븷 諛?紐⑹쟻]
?뱀떊? ?쒓뎅??臾몄옣 援먯젙 ?꾨Ц媛?? ?낅젰???띿뒪?몄뿉??<details> 釉붾줉怨?肄붾뱶釉붾윮? 留λ씫 李멸퀬???먮Ц?쇰줈留??ъ슜?섍퀬, ?ㅼ젣 援먯젙 ??곸? 蹂댄샇 ?좏겙 諛붽묑???쒓뎅??蹂몃Ц, ?쒖닠, NPC ??щ떎.

紐⑺몴???먮Ц???뺤떇怨?援ъ“, ?ш굔, ?뺣낫, 媛먯젙?? 罹먮┃?곗꽦, 愿怨? 留먰닾, ?몄묶, ?λ㈃ ?섎룄瑜??좎???梨??쒓뎅??臾몄옣???먯뿰?ㅻ읇怨??쎄린 醫뗪쾶 ?ㅻ벉??寃껋씠?? ?먮Ц???녿뒗 ?ш굔, 媛먯젙, ?ㅻ챸, ?됰룞, 愿怨?吏꾩쟾, ??? ?ㅼ젙? 異붽??섏? ?딅뒗??

[?묒뾽 ?곗꽑?쒖쐞]
1. <details> 釉붾줉怨?肄붾뱶釉붾윮, ?먮Ц??以꾨컮轅? 臾몃떒 援щ텇, Markdown 援ъ“, ?대?吏 留곹겕, ?곹깭李? ?대쫫?? ?뱀닔湲고샇 蹂댁〈
2. ?먮Ц???ш굔, ?뺣낫, 媛먯젙?? 罹먮┃?곗꽦, 愿怨? ????섎룄 蹂댁〈
3. <details>??Logic / Relation Database瑜?李멸퀬?섏뿬 ?몄묶, 留먰닾, 愿怨?嫄곕━媛? NSFW Gate ?곹깭瑜??쇨??섍쾶 ?좎?
4. 留욎땄踰? ?꾩뼱?곌린, 臾몃쾿 ?ㅻ쪟 援먯젙
5. 踰덉뿭?ъ? 遺?먯뿰?ㅻ윭???쒗쁽 ?쒓굅
6. ?댁꽕?? 硫뷀????ㅻ챸, 吏곸젒???щ━ ?ㅻ챸??以꾩씠怨??됰룞쨌諛섏쓳쨌移⑤У쨌?쒖꽑 以묒떖?쇰줈 ?ㅻ벉湲?7. 臾몄옣?????쎄린 醫뗪쾶 留뚮뱾?? ?먮Ц???섎?? ?λ㈃ 吏꾪뻾??諛붽씀吏 ?딄린

[援먯젙 ???踰붿쐞]
- 蹂댄샇 ?좏겙 諛붽묑??visible body, ?쒓뎅??蹂몃Ц, ?쒖닠, NPC ??щ쭔 援먯젙?쒕떎.
- <details> 釉붾줉? ?닿퀬 ?ル뒗 ?쒓렇, summary, ?대? 以꾨컮轅? ?곸뼱 硫뷀??곗씠?? ?섏튂, ?대쫫, ?⑹뼱, 湲고샇瑜??ы븿????湲?먮룄 ?섏젙?섏? ?딅뒗??
- <details> ?대????곸뼱???쒓뎅?대줈 踰덉뿭?섏? ?딅뒗??
- Relation Database???섏튂, ?곹깭媛? 媛먯젙媛? ?대쫫, ?몄묶 ?꾨낫, nsfw-gate 湲곕줉? ?섏젙?섏? ?딅뒗??
- 肄붾뱶釉붾윮 ?덉쓽 ?댁슜? ?섏젙?섏? ?딅뒗??
- Markdown ?대?吏 留곹겕, URL, HTML ?쒓렇, ?곹깭李? ?쒖뒪???쒓린, 硫뷀? ?쒓린, ?愿꾪샇 ?쒓렇, ?대쫫?? ?뱀닔湲고샇??媛?ν븳 ???먮낯 洹몃?濡??좎??쒕떎.
- @@TC_PROTECTED_BLOCK_N@@ ?뺥깭???좏겙? ?덈? 蹂寃쏀븯嫄곕굹 ??젣?섏? ?딅뒗??

[蹂댄샇 釉붾줉 泥섎━]
- @@TC_PROTECTED_BLOCK_N@@ ?좏겙? <details> 釉붾줉 ?먮뒗 肄붾뱶釉붾윮 ?먮Ц????좏븯???먮━?쒖떆?먮떎.
- ?좏겙??泥좎옄, ?レ옄, ?쒖꽌, 媛쒖닔, ?꾩튂瑜??덈? 諛붽씀吏 ?딅뒗??
- [<details> 留λ씫 ?먮Ц]怨?[肄붾뱶釉붾윮 留λ씫 ?먮Ц]? 李멸퀬?⑹씠硫?援먯젙?섍굅??異쒕젰 ??곸쑝濡??쇱? ?딅뒗??
- <details> 留λ씫 ?먮Ц? ?몄묶, 留먰닾, 愿怨? ?곹깭媛? NSFW Gate ?먮떒?먮쭔 李멸퀬?쒕떎.
- 肄붾뱶釉붾윮 留λ씫 ?먮Ц? 臾몃㎘ ?댄빐?먮쭔 李멸퀬?섍퀬, 肄붾뱶 ?댁슜 ?먯껜瑜??섏젙?섍굅???댁꽕?섏? ?딅뒗??
- 理쒖쥌 異쒕젰?먮뒗 援먯젙???꾩껜 蹂몃Ц怨??먮옒 ?꾩튂??蹂댄샇 ?좏겙留??④릿??

[?듭떖 援먯젙 ?먯튃]
- ?꾩뼱?곌린, 留욎땄踰? 臾몃쾿 ?ㅻ쪟瑜?諛붾줈?〓뒗??
- 議곗궗??諛쏆묠 ?좊Т? 臾몃㎘???곕씪 ?뺥솗???좏깮?쒕떎.
- '~?섎뒗 寃껋씠??, '~???섑빐', '~?섏뼱吏?? 媛숈? 踰덉뿭泥??쒗쁽???먯뿰?ㅻ윭???쒓뎅?대줈 諛붽씔??
- ?紐낆궗('?뱀떊', '洹?, '洹몃?', '洹몃뱾' ?????먯뿰?ㅻ윭???몄묶?대굹 ?앸왂?쇰줈 ?泥댄븳??
- ?섎룞?쒕뒗 媛?ν븳 ?λ룞?쒕줈 諛붽씀?? ?먮Ц???섏븰?ㅺ? ?щ씪吏硫??좎??쒕떎.
- 遺덊븘?뷀븳 ?묒냽?ъ? 以묐났 ?쒗쁽??以꾩씠?? 臾몄옣???댁깋?댁쭏 留뚰겮 湲곌퀎?곸쑝濡???젣?섏? ?딅뒗??
- ?먮Ц???녿뒗 鍮꾩쑀, 臾섏궗, 媛먯젙, ?됰룞, ?뚯긽, ?ㅻ챸??異붽??섏? ?딅뒗??

[?대㈃ ?붿빟臾?泥섎━]
- 媛먯젙쨌?곹깭쨌?먯씤쨌源⑤떖?뚯쓣 吏곸젒 ?붿빟?섎뒗 臾몄옣??以꾩씤??
- ?뱁엳 "遺덉븞?덈떎", "?붽? ?щ떎", "湲댁옣?덈떎", "?뱁솴?덈떎", "臾댁꽌?좊떎", "?곸쿂諛쏆븯??, "?뺤떊???꾨뱷?덈떎", "?뚮쫫???뗭븯??, "~?쇨퀬 ?먭펷??, "~?쇰뒗 ?ъ떎??源⑤떖?섎떎", "~??寃?媛숈븯??, "~?뚮Ц?댁뿀?? 媛숈? ?쒗쁽? ?됰룞, 諛섏쓳, 移⑤У, ?쒖꽑 以묒떖??臾몄옣?쇰줈 諛붽씔??
- 媛?ν븯硫??대? ?먮Ц???덈뒗 ?? ?쒖꽑, ?명씉, 嫄몄쓬, 留먮걹, 移⑤У, 嫄곕━媛? 臾쇨굔, ?먯꽭, 諛섏쓳???ъ슜??媛숈? 媛먯젙???쒕윭?몃떎.
- ?먮Ц???녿뒗 ???됰룞?대굹 ???섎?瑜?留뚮뱾吏 留먭퀬, 臾몄옣???묎쾶 履쇨컻嫄곕굹 湲곗〈 臾섏궗??珥덉젏??諛붽씀??諛⑹떇?쇰줈 泥섎━?쒕떎.
- ?대㈃??諛섎뱶??吏곸젒 ?⑥빞 ???뚮뒗 ??臾몄옣 ?덉뿉??吏㏐퀬 嫄곗튌寃?泥섎━?섍퀬, ?먯씤??湲멸쾶 ?ㅻ챸?섏? ?딅뒗??

[臾몄껜 湲곗?]
- 蹂댄샇 ?좏겙 諛붽묑 蹂몃Ц??臾섏궗? ?쒖닠??醫낃껐?대????먮Ц??臾몄껜瑜??좎??쒕떎.
- 媛먯젙쨌?섎룄쨌愿怨꽷룹썝?몄쓣 吏곸젒 ?ㅻ챸?섎뒗 臾몄옣? ?먮Ц???섎?瑜??좎??섎뒗 踰붿쐞?먯꽌 ?됰룞, 諛섏쓳, 移⑤У, ?쒖꽑, 嫄곕━媛? 留먯쓽 由щ벉?쇰줈 ?먯뿰?ㅻ읇寃??뺣룉?쒕떎.
- ?ㅻ쭔 ?먮Ц???녿뒗 ?됰룞?대굹 ??щ? ?덈줈 留뚮뱾吏 ?딅뒗??
- "留덉튂 ~????뻽??, "~泥섎읆 蹂댁???, "~?쇰뒗 ?ъ떎??源⑤떖?섎떎", "~??媛먯젙???ㅼ뿀?? 媛숈? ?댁꽕?ъ? 硫뷀????쒗쁽? 理쒖냼?뷀븯怨??먯뿰?ㅻ윭??臾섏궗濡?諛붽씔??
- ?낆옄?먭쾶 ?곹솴???ㅻ챸?섎뒗 臾몄옣, ?묓뭹 諛붽묑?먯꽌 ?댁꽕?섎뒗 臾몄옣, 援먯젙?먯쓽 ?먮떒???쒕윭?섎뒗 臾몄옣??異쒕젰?섏? ?딅뒗??
- ?몃Ъ???몃え? ?됰룞? ?대갚?섍쾶 ?ㅻ벉?붾떎. 怨쇱옣???섏떇, ?μ떇?곸씤 臾섏궗, 遺덊븘?뷀븳 ?좎껜 珥덉젏? 以꾩씤??
- 臾몄옣 以?170cm, 64kg, C而?媛??媛숈? ?곗씠?? ?섏튂 ?쒗쁽? 媛먯꽦?? 臾명븰???쒗쁽?쇰줈 ?먯뿰?ㅻ읇寃?蹂寃쏀븳??
- ?쒓컙 紐낆궗援ъ뿉???섎웾 ?쒗쁽(10???? ??????? 鍮꾩쑀?? 媛먯꽦?? 臾명븰?곸쑝濡?援먯젙?쒕떎.

[???
- ?곕뵲?댄몴("...") ?덉쓽 ?띿뒪?몃뒗 ?몃Ъ????щ줈 痍④툒?쒕떎.
- ?곕뵲?댄몴 ?덉쓽 ??щ? ?쒖닠臾몄쑝濡?諛붽씀嫄곕굹, ?쒖닠臾몄쓣 ?꾩쓽濡???ы솕?섏? ?딅뒗??
- ?몃Ъ????щ뒗 ?먮옒 留먰닾? 媛먯젙?좎쓣 ?좎??섎㈃???먯뿰?ㅻ윭??援ъ뼱泥대줈 ?ㅻ벉?붾떎.
- <details>??Voice, Address, Relationship ?뺣낫? ????먮쫫??李멸퀬?섎ŉ, ?⑥닚??湲곕줉???몄묶??湲곌퀎?곸쑝濡?諛섎났?섏? 留먭퀬 ?몃Ъ 愿怨? ?섏씠쨌?깅챸 援щ텇, 移쒕??? ?좎묶, 嫄곕━媛? ?λ㈃??媛먯젙?좎뿉 留욎떠 NPC ??????몄묶???먯뿰?ㅻ읇寃??섏젙?쒕떎.
- ?깃낵 ?대쫫???ㅼ꽎?嫄곕굹, ?좎묶쨌吏곹븿쨌議댁묶쨌?대쫫 遺由꾩씠 愿怨꾩뿉 鍮꾪빐 ?댁깋??寃쎌슦?먮뒗 ?먮Ц??愿怨꾨? 諛붽씀吏 ?딅뒗 踰붿쐞?먯꽌 ?쒓뎅????붿뿉 留욌뒗 ?몄묶?쇰줈 ?뺣룉?쒕떎.
- 議대뙎留?諛섎쭚, ?믪엫 ?쒗쁽, 遺由꾨쭚, 留먮걹? ?곷????愿怨?諛??꾩옱 ?λ㈃??湲댁옣?꾩뿉 留욊쾶 ?먯뿰?ㅻ읇寃??좎??섍굅??蹂댁젙?쒕떎.
- ???留λ씫??遺?먯뿰?ㅻ윭???댄닾? ?쒗쁽??蹂寃쏀븳??
- ????? ??怨좊갚, ???쎌냽, ??愿怨?吏꾩쟾, ???섎룄??異붽??섏? ?딅뒗??
- 罹먮┃?곗쓽 ?깃꺽, 愿怨? 嫄곕━媛먯씠 諛붾뚯? ?딅룄濡?二쇱쓽?쒕떎.
- 罹먮┃?곗쓽 嫄곗튇 留먰닾, ?뺤꽕 媛뺣룄, ?몄묶, ???由щ벉? 怨쇰룄?섍쾶 ?쒗솕?섏? ?딅뒗??

[NSFW Gate 諛섏쁺]
- <details>??[NSFW Gate]瑜?諛섎뱶??李멸퀬?쒕떎.
- state媛 closed??寃쎌슦, 蹂댄샇 ?좏겙 諛붽묑 蹂몃Ц?먯꽌 ?깆쟻 ?좎껜 珥덉젏, ?좎젙??遺꾩쐞湲? ?먮줈?깊븳 ?꾨젅?대컢, ?붿떆??怨좎“, 媛뺤젣??移쒕?媛? ?곕컻??移쒕?媛? ?몄텧 ?꾨젅?대컢, ?λ텇 ?⑥꽌, 吏묒슂???좎껜 臾섏궗瑜?媛뺥솕?섏? ?딅뒗??
- state媛 closed?몃뜲 蹂몃Ц??洹몃윴 ?쒗쁽???덉쑝硫? ?먮Ц ?ш굔??諛붽씀吏 ?딅뒗 踰붿쐞?먯꽌 以묐┰?곸씠怨??ㅼ슜?곸씤 臾섏궗, 媛먯젙???덉젣???몃? ?좏샇, ?λ㈃ 遺꾩쐞湲곕줈 ??텣??
- ?좎껜, ?룹감由? ?곸쿂 移섎즺, 媛源뚯슫 嫄곕━, ?뱁솴, 痍⑥빟?⑥씠 ?꾩슂???λ㈃?대씪???깆쟻 ?섏븰?ㅻ줈 ?곗? 留먭퀬 ?λ㈃ ?댄빐???꾩슂??留뚰겮留?以묐┰?곸쑝濡??④릿??
- state媛 limited ?먮뒗 open??寃쎌슦?먮룄 <details>??湲곕줉??allowed / blocked 踰붿쐞瑜??섏? ?딅뒗??
- start媛 closed every turn?닿굅??reopened-this-turn??no??寃쎌슦, ?댁쟾 ?댁쓽 open ?곹깭???ъ슫???꾩옱 ?댁쓽 ?덇?濡?媛꾩＜?섏? ?딅뒗??
- continuation??ambiguous ?먮뒗 none?닿굅??if-uncertain??closed??寃쎌슦, ?깆쟻쨌?좎젙???섏븰?ㅻ? 以묐┰?뷀븳??
- 怨쇨굅 ?덇?, ?멸컧?? 濡쒕㎤?? ?뚮윭?? ?좎껜??洹쇱젒, ?몄텧 ?섏긽, 紐⑹슃, ?곸쿂 移섎즺, ?ъ쟻???μ냼, 吏곸쟾 ?댁쓽 遺꾩쐞湲곕뒗 洹??먯껜濡??꾩옱 ?댁쓽 ?덇?媛 ?꾨땲??

[蹂댁〈 洹쒖튃]
- <details> ?쒓렇? 洹??대? ?댁슜? ??湲?먮룄 ?섏젙?섏? 留먭퀬 ?먮낯 洹몃?濡?異쒕젰?쒕떎.
- 肄붾뱶釉붾윮 ?덉쓽 ?댁슜? ?섏젙?섏? ?딅뒗??
- @@TC_PROTECTED_BLOCK_N@@ ?뺥깭???좏겙? ?덈? 蹂寃쏀븯嫄곕굹 ??젣?섏? ?딅뒗??
- ?먮Ц??以꾨컮轅? 臾몃떒 援щ텇, Markdown 湲고샇, ?대?吏 留곹겕, URL, HTML ?쒓렇, 蹂꾪몴, ?곗샂?? 愿꾪샇, ?愿꾪샇, ?대쫫?? ?뱀닔湲고샇瑜?媛?ν븳 ???좎??쒕떎.
- ?곹깭李? ?쒖뒪???쒓린, 吏꾪뻾 ?쒓린, 硫뷀? ?쒓린泥섎읆 援ъ“?붾맂 ?뺣낫???먮낯 ?뺤떇???좎??쒕떎.
- 援먯젙 ?몄쓽 遺???ㅻ챸, ?몄궗留? 媛먯긽, 二쇱꽍??異쒕젰?섏? ?딅뒗??
- ?ㅼ쭅 援먯젙???꾩껜 蹂몃Ц留?異쒕젰?쒕떎.`;
    // =============================================
    //  ?ㅽ???    // =============================================
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
        #trans-setting-btn { position: fixed; z-index: 2147483647; background-color: #FF4432; color: white; border: none; border-radius: 50%; width: 48px; height: 48px; font-size: 24px; cursor: move; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: background-color 0.3s; display: flex; align-items: center; justify-content: center; touch-action: none; }
        #trans-setting-btn:hover { background-color: #e03c2a; }
        #trans-quick-btn { position: fixed; right: 20px; bottom: 80px; z-index: 2147483647; background-color: #6A3DE8; color: white; border: none; border-radius: 50%; width: 48px; height: 48px; font-size: 22px; cursor: move; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: background-color 0.3s, opacity 0.2s; display: none; align-items: center; justify-content: center; touch-action: none; }
        #trans-quick-btn:hover { background-color: #5228CC; }
        #trans-quick-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        #trans-setting-panel { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2147483647; background-color: #F7F7F5; border: 1px solid #C7C5BD; border-radius: 8px; padding: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); display: none; width: 320px; max-width: 85vw; }
        #trans-setting-panel h4 { margin: 0 0 12px 0; color: #1A1918; font-family: sans-serif; font-size: 16px; text-align: center; }
        .trans-label { font-size: 13px; color: #61605A; margin-bottom: 4px; display: block; font-family: sans-serif; font-weight: bold; }
        #trans-api-key, #trans-model-select, #trans-provider-select, #trans-deepseek-endpoint, #trans-deepseek-reasoning, #trans-openrouter-reasoning, #trans-openrouter-provider, #trans-vertex-project, #trans-vertex-location, #trans-custom-prompt { width: 100%; box-sizing: border-box; padding: 8px; margin-bottom: 12px; border: 1px solid #C7C5BD; border-radius: 4px; font-size: 13px; font-family: sans-serif; }
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
    `);

    // =============================================
    //  DOM 鍮뚮뱶
    // =============================================
    const settingBtn = document.createElement('button');
    settingBtn.id = 'trans-setting-btn';
    settingBtn.innerHTML = 'SET';
    document.body.appendChild(settingBtn);

    const quickBtn = document.createElement('button');
    quickBtn.id = 'trans-quick-btn';
    quickBtn.title = '??λ맂 ?ㅼ젙?쇰줈 理쒖떊 ?듬? 諛붾줈 援먯젙';
    quickBtn.innerHTML = 'GO';
    document.body.appendChild(quickBtn);

    const panel = document.createElement('div');
    panel.id = 'trans-setting-panel';
    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h4 style="margin:0;font-size:16px;color:#1A1918;font-family:sans-serif;">珥덉썡 援먯젙 ?ㅼ젙 v5.1.2</h4>
            <button id="trans-panel-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#61605A;line-height:1;padding:0 4px;">x</button>
        </div>
        <span class="trans-label">API 怨듦툒??</span>
        <select id="trans-provider-select">
            <option value="gemini">Gemini</option>
            <option value="deepseek">DeepSeek</option>
            <option value="openrouter">OpenRouter</option>
            <option value="vertex">Vertex AI</option>
        </select>
        <span class="trans-label" id="trans-model-label">紐⑤뜽紐?(吏곸젒 ?낅젰):</span>
        <input type="text" id="trans-model-select" placeholder="?? gemini-3-flash-preview">
        <span class="trans-label" id="trans-api-key-label">API ??</span>
        <input type="text" id="trans-api-key" placeholder="API ?ㅻ? ?낅젰?댁＜?몄슂">
        <div id="trans-deepseek-options" style="display:none;">
            <span class="trans-label">DeepSeek API 二쇱냼:</span>
            <input type="text" id="trans-deepseek-endpoint" placeholder="https://api.deepseek.com/chat/completions">
            <span class="trans-label">DeepSeek 異붾줎 媛뺣룄:</span>
            <select id="trans-deepseek-reasoning"><option value="disabled">Disabled</option><option value="high">High</option><option value="max">MAX</option></select>
        </div>
        <div id="trans-openrouter-options" style="display:none;">
            <span class="trans-label">OpenRouter 異붾줎 媛뺣룄:</span>
            <select id="trans-openrouter-reasoning"><option value="none">None</option><option value="minimal">Minimal</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="xhigh">XHigh</option></select>
            <span class="trans-label">OpenRouter 怨듦툒???щ윭洹?(?좏깮):</span>
            <input type="text" id="trans-openrouter-provider" placeholder="?? siliconflow ?먮뒗 siliconflow, deepinfra">
        </div>
        <div id="trans-vertex-options" style="display:none;">
            <span class="trans-label">Vertex 프로젝트 ID:</span>
            <input type="text" id="trans-vertex-project" placeholder="예: my-gcp-project">
            <span class="trans-label">Vertex 리전:</span>
            <input type="text" id="trans-vertex-location" placeholder="예: us-central1">
            <div class="trans-help-text">API 키 칸에는 Vertex AI OAuth 액세스 토큰을 넣으세요.</div>
        </div>        <div class="trans-toggle-label">
            <span class="trans-switch-title">?먮룞 援먯껜</span>
            <button type="button" id="trans-auto-replace-toggle" role="switch" aria-checked="false"><span class="trans-switch-text">OFF</span><span class="trans-switch-knob"></span></button>
        </div>
        <span class="trans-label">援먯젙 吏移⑥꽌 (?섏젙 媛??:</span>
        <div class="trans-help-text">v4.1? Gemini 鍮??묐떟???깃났 泥섎━?섏? ?딄퀬 ?먯씤???쒖떆?⑸땲??</div>
        <textarea id="trans-custom-prompt" rows="6"></textarea>
        <div class="trans-btn-group">
            <button class="trans-panel-btn" id="trans-reset-btn">湲곕낯媛?蹂듦뎄</button>
            <button class="trans-panel-btn" id="trans-save-btn">Save</button>
        </div>
        <button class="trans-panel-btn" id="trans-translate-btn">??理쒖떊 ?듬? 援먯젙?섍린</button>
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
            <h3>??援먯젙 寃곌낵 ?뺤씤</h3>
            <div class="trans-reroll-group">
                <input type="text" id="trans-modal-model" placeholder="紐⑤뜽紐??낅젰" style="width:160px;padding:6px;border-radius:4px;border:1px solid #C7C5BD;font-size:13px;">
                <button id="trans-reroll-btn">Reroll</button>
            </div>
        </div>
        <div id="trans-result-content"></div>
        <div class="trans-modal-footer">
            <div class="trans-history-nav">
                <button class="trans-nav-btn" id="trans-prev-btn">? ?댁쟾</button>
                <span id="trans-history-count">1 / 1</span>
                <button class="trans-nav-btn" id="trans-next-btn">Next</button>
            </div>
            <div class="trans-modal-btns">
                <button class="trans-modal-btn trans-close-btn" id="trans-close-modal">?リ린</button>
                <button class="trans-modal-btn trans-patch-btn" id="trans-patch-modal">??寃곌낵濡?援먯껜?섍린</button>
            </div>
        </div>
    `;
    document.body.appendChild(resultModal);

    const toast = document.createElement('div');
    toast.id = 'trans-toast';
    document.body.appendChild(toast);

    // =============================================
    //  ?ㅼ젙 ?붿냼 李몄“ 諛?珥덇린媛?濡쒕뱶
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
    const vertexOptions = document.getElementById('trans-vertex-options');
    const vertexProjectInput = document.getElementById('trans-vertex-project');
    const vertexLocationInput = document.getElementById('trans-vertex-location');
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
        if (provider === 'vertex') return 'Vertex AI';
        return 'Gemini';
    }
    function getDefaultModel(provider) {
        if (provider === 'deepseek') return DEFAULT_DEEPSEEK_MODEL;
        if (provider === 'openrouter') return DEFAULT_OPENROUTER_MODEL;
        if (provider === 'vertex') return DEFAULT_VERTEX_MODEL;
        return DEFAULT_GEMINI_MODEL;
    }
    function normalizeGeminiModel(model) {
        const value = String(model || '').trim();
        if (!value || value === 'gemini-flash-latest' || value === 'gemini-flash-lite-latest') return DEFAULT_GEMINI_MODEL;
        return value;
    }
    function getSavedModel(provider) {
        if (provider === 'deepseek') return GM_getValue('deepSeekModel', DEFAULT_DEEPSEEK_MODEL);
        if (provider === 'openrouter') return GM_getValue('openRouterModel', DEFAULT_OPENROUTER_MODEL);
        if (provider === 'vertex') return GM_getValue('vertexModel', DEFAULT_VERTEX_MODEL);
        return normalizeGeminiModel(GM_getValue('apiModel', DEFAULT_GEMINI_MODEL));
    }
    function getSavedApiKey(provider) {
        if (provider === 'deepseek') return GM_getValue('deepSeekApiKey', '');
        if (provider === 'openrouter') return GM_getValue('openRouterApiKey', '');
        if (provider === 'vertex') return GM_getValue('vertexAccessToken', '');
        return GM_getValue('apiKey', '');
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
        } else if (provider === 'vertex') {
            GM_setValue('vertexAccessToken', apiKeyInput.value.trim());
            GM_setValue('vertexModel', model);
            GM_setValue('vertexProject', vertexProjectInput.value.trim());
            GM_setValue('vertexLocation', vertexLocationInput.value.trim() || DEFAULT_VERTEX_LOCATION);
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
        modelSelect.placeholder = `?? ${getDefaultModel(provider)}`;
        modelLabel.textContent = `${getProviderDisplayName(provider)} 紐⑤뜽紐?(吏곸젒 ?낅젰):`;
        apiKeyLabel.textContent = `${getProviderDisplayName(provider)} API ??`;
        deepSeekOptions.style.display = provider === 'deepseek' ? 'block' : 'none';
        openRouterOptions.style.display = provider === 'openrouter' ? 'block' : 'none';
        vertexOptions.style.display = provider === 'vertex' ? 'block' : 'none';
        deepSeekEndpointInput.value = GM_getValue('deepSeekEndpoint', DEFAULT_DEEPSEEK_ENDPOINT);
        deepSeekReasoningSelect.value = GM_getValue('deepSeekReasoningEffort', 'disabled');
        openRouterReasoningSelect.value = GM_getValue('openRouterReasoningEffort', 'none');
        openRouterProviderInput.value = GM_getValue('openRouterProvider', '');
        vertexProjectInput.value = GM_getValue('vertexProject', '');
        vertexLocationInput.value = GM_getValue('vertexLocation', DEFAULT_VERTEX_LOCATION);
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
    //  ?쒕옒洹?    // =============================================
    let isDragging = false, dragMoved = false, activeDragBtn = null;
    let startX, startY, initialLeft, initialTop;
    const dragStateMap = new Map();
    function clampDraggableButton(btn, posXKey, posYKey) {
        const w = window.innerWidth, h = window.innerHeight;
        const bW = btn.offsetWidth || 48, bH = btn.offsetHeight || 48;
        let l = parseFloat(btn.style.left), t = parseFloat(btn.style.top);
        if (isNaN(l) || l < 0 || l > w - bW) l = w - bW - 20;
        if (isNaN(t) || t < 0 || t > h - bH) t = h - bH - 20;
        btn.style.left = l + 'px'; btn.style.top = t + 'px';
        btn.style.bottom = 'auto'; btn.style.right = 'auto';
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
    initDraggableButton(settingBtn, 'btnPosX', 'btnPosY', window.innerWidth - 68, window.innerHeight - 68);
    initDraggableButton(quickBtn, 'quickBtnPosX', 'quickBtnPosY', window.innerWidth - 68, window.innerHeight - 128);
    setTimeout(clampAllDraggableButtons, 100); setTimeout(clampAllDraggableButtons, 500);
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
    //  ?좏떥由ы떚
    // =============================================
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    function showToast(msg, duration = 3000) { toast.textContent = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), duration); }
    function setStatus(msg, type = 'info') { statusBox.textContent = msg; statusBox.className = `active ${type}`; }
    function clearStatus() { statusBox.className = ''; statusBox.textContent = ''; }
    function isChattingPage() { return location.hostname === 'www.eden-chat.com'; }
    function buildFinalPrompt() { return customPromptInput?.value || GM_getValue('customPrompt', baseSystemPrompt); }
    function stripOuterFence(text) { return text.replace(/^```[^\n]*\n([\s\S]*?)\n```\s*$/m, '$1').trim(); }
    function createProtectedCorrectionInput(text) {
        const blocks = [];
        const detailContexts = [];
        const codeContexts = [];
        const protect = (block, kind) => {
            const token = `@@TC_PROTECTED_BLOCK_${blocks.length}@@`;
            blocks.push({ token, block, kind });
            if (kind === 'details') detailContexts.push(block);
            if (kind === 'code') codeContexts.push(block);
            return token;
        };
        const protectedText = String(text || '')
            .replace(CODE_BLOCK_RE, match => protect(match, 'code'))
            .replace(DETAILS_BLOCK_RE, match => protect(match, 'details'));
        return { protectedText, blocks, detailContexts, codeContexts };
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
            throw new Error(`蹂댁〈 釉붾줉 ?좏겙 ?ㅻ쪟: missing=${missing.join(', ') || 'none'}, leftover=${leftovers?.join(', ') || 'none'}`);
        }
        return restored;
    }
    function buildCorrectionInput(text, userContext = '') {
        const protection = createProtectedCorrectionInput(text);
        const tokens = protection.blocks.map(item => item.token);
        const tokenGuide = tokens.length
            ? `[蹂댁〈 釉붾줉 ?좏겙]\n?ㅼ쓬 ?좏겙? 肄붾뱶釉붾윮 ?먮뒗 <details> ?먮Ц????좏븳?? 援먯젙 ????덉쓽 ?좏겙 泥좎옄, 媛쒖닔, ?꾩튂瑜??덈? 諛붽씀吏 留먭퀬 洹몃?濡?異쒕젰?쒕떎.\n${tokens.join('\n')}\n\n`
            : '';
        const detailsContext = protection.detailContexts.length
            ? `[<details> 留λ씫 ?먮Ц - 李멸퀬?? 援먯젙/異쒕젰 ????꾨떂]\n${protection.detailContexts.join('\n\n')}\n\n`
            : '';
        const codeContext = protection.codeContexts.length
            ? `[肄붾뱶釉붾윮 留λ씫 ?먮Ц - 李멸퀬?? 援먯젙/異쒕젰 ????꾨떂]\n${protection.codeContexts.join('\n\n')}\n\n`
            : '';
        const body = userContext
            ? `[吏곸쟾 ?좎? ?낅젰 - 留λ씫 李멸퀬?? 援먯젙 ????꾨떂]\n${userContext}\n\n[援먯젙 ???AI ?듬?]\n${protection.protectedText}`
            : `[援먯젙 ???AI ?듬?]\n${protection.protectedText}`;
        return { contextBlock: tokenGuide + detailsContext + codeContext + body, protectedBlocks: protection.blocks };
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
        return /HTTP\s*(408|429|500|502|503|504)|timeout|network|empty response/i.test(msg);
    }

    // =============================================
    //  API ?몄텧
    // =============================================
    function callGeminiOnce(text, overrideModel = null, userContext = '') {
        return new Promise((resolve, reject) => {
            const apiKey = GM_getValue('apiKey', '').trim();
            if (!apiKey) { reject(new Error('Gemini API ?ㅺ? ?ㅼ젙?섏? ?딆븯?듬땲??')); return; }

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
                    // v4.1: 湲곗〈 v4.0 ?ㅼ젙 ?좎?. ?? 鍮??묐떟?대㈃ ?먯씤???쒖떆?⑸땲??
                    generationConfig: { temperature: 0.7, thinkingConfig: { thinkingLevel: 'Low' } },
                }),
                onload(res) {
                    try {
                        let data = {};
                        try { data = JSON.parse(res.responseText || '{}'); }
                        catch {
                            reject(new Error(`Gemini ?묐떟 JSON ?뚯떛 ?ㅽ뙣. HTTP ${res.status}: ${(res.responseText || '(empty)').slice(0, 800)}`));
                            return;
                        }

                        console.log('[珥덉썡 援먯젙湲?Gemini raw v4.1]', {
                            status: res.status,
                            statusText: res.statusText,
                            model: modelId,
                            response: data,
                        });

                        if (res.status < 200 || res.status >= 300) {
                            reject(new Error(data?.error?.message || `Gemini API ?ㅻ쪟 HTTP ${res.status}: ${(res.responseText || '(empty)').slice(0, 800)}`));
                            return;
                        }
                        if (data.error) {
                            reject(new Error(data.error.message || safeStringify(data.error)));
                            return;
                        }

                        const blockReason = data.promptFeedback?.blockReason;
                        if (blockReason) {
                            reject(new Error(`Gemini ?꾨＼?꾪듃 李⑤떒?? ${blockReason}\n${safeStringify(data.promptFeedback?.safetyRatings || [])}`));
                            return;
                        }

                        const candidate = data.candidates?.[0];
                        const finishReason = candidate?.finishReason || 'unknown';
                        const raw = getGeminiTextFromCandidate(candidate);

                        if (!raw.trim()) {
                            reject(new Error(
                                `Gemini ?묐떟 蹂몃Ц??鍮꾩뼱 ?덉뒿?덈떎.\n` +
                                `finishReason=${finishReason}\n` +
                                `promptFeedback=${safeStringify(data.promptFeedback || null, 900)}\n` +
                                `candidate=${safeStringify(candidate || null, 1200)}\n\n` +
                                `釉뚮씪?곗? 媛쒕컻?먮룄援?Console??[珥덉썡 援먯젙湲?Gemini raw v4.1] 濡쒓렇瑜??뺤씤?댁＜?몄슂.`
                            ));
                            return;
                        }

                        const cleaned = stripOuterFence(raw);
                        const restored = restoreProtectedBlocks(cleaned, protectedBlocks);
                        resolve(restored);
                    } catch (e) { reject(e); }
                },
                ontimeout() { reject(new Error(`Gemini ?붿껌 ?쒓컙??珥덇낵?섏뿀?듬땲?? timeout=${GEMINI_TIMEOUT_MS}ms`)); },
                onerror(err) { reject(new Error(`Gemini ?ㅽ듃?뚰겕 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎: ${err?.error || 'unknown'}`)); },
            });
        });
    }

    async function callGemini(text, overrideModel = null, userContext = '') {
        let lastErr = null;
        for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
            try {
                if (attempt > 0) setStatus(`??Gemini ?ъ떆??以묅?(${attempt}/${GEMINI_MAX_RETRIES})`, 'info');
                return await callGeminiOnce(text, overrideModel, userContext);
            } catch (err) {
                lastErr = err;
                console.warn(`[珥덉썡 援먯젙湲?Gemini retry ${attempt}/${GEMINI_MAX_RETRIES}]`, err);
                if (attempt >= GEMINI_MAX_RETRIES || !shouldRetryGeminiError(err)) break;
                await sleep(GEMINI_RETRY_BASE_DELAY_MS * (attempt + 1));
            }
        }
        throw lastErr;
    }

    function callDeepSeek(text, overrideModel = null, userContext = '') {
        return new Promise((resolve, reject) => {
            const apiKey = GM_getValue('deepSeekApiKey', '').trim();
            if (!apiKey) { reject(new Error('DeepSeek API ?ㅺ? ?ㅼ젙?섏? ?딆븯?듬땲??')); return; }
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
                        if (res.status < 200 || res.status >= 300) { reject(new Error(data?.error?.message || `DeepSeek API ?ㅻ쪟 ${res.status}`)); return; }
                        if (data.error) { reject(new Error(data.error.message)); return; }
                        const choice = data.choices?.[0];
                        const raw = choice?.message?.content ?? '';
                        if (!raw) { reject(new Error(`DeepSeek ?묐떟 蹂몃Ц??鍮꾩뼱 ?덉뒿?덈떎. finish_reason=${choice?.finish_reason || 'unknown'}.`)); return; }
                        resolve(restoreProtectedBlocks(stripOuterFence(raw), protectedBlocks));
                    } catch (e) { reject(e); }
                },
                ontimeout() { reject(new Error('DeepSeek ?붿껌 ?쒓컙??珥덇낵?섏뿀?듬땲??')); },
                onerror() { reject(new Error('DeepSeek ?ㅽ듃?뚰겕 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.')); },
            });
        });
    }

    function callOpenRouter(text, overrideModel = null, userContext = '') {
        return new Promise((resolve, reject) => {
            const apiKey = GM_getValue('openRouterApiKey', '').trim();
            if (!apiKey) { reject(new Error('OpenRouter API ?ㅺ? ?ㅼ젙?섏? ?딆븯?듬땲??')); return; }
            const modelId = overrideModel || GM_getValue('openRouterModel', DEFAULT_OPENROUTER_MODEL);
            const reasoningEffort = GM_getValue('openRouterReasoningEffort', 'none');
            const providerRouting = getOpenRouterProviderRouting();
            const { contextBlock, protectedBlocks } = buildCorrectionInput(text, userContext);
            GM_xmlhttpRequest({
                method: 'POST', timeout: 120000, url: DEFAULT_OPENROUTER_ENDPOINT,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'HTTP-Referer': 'https://www.eden-chat.com/', 'X-Title': 'Eden Chat Transcendent Corrector' },
                data: JSON.stringify({ model: modelId, messages: [{ role: 'system', content: buildFinalPrompt() }, { role: 'user', content: contextBlock }], temperature: 0.7, reasoning: { effort: reasoningEffort, exclude: true }, ...(providerRouting ? { provider: providerRouting } : {}), stream: false }),
                onload(res) {
                    try {
                        const data = JSON.parse(res.responseText || '{}');
                        if (res.status < 200 || res.status >= 300) { reject(new Error(data?.error?.message || `OpenRouter API ?ㅻ쪟 ${res.status}`)); return; }
                        if (data.error) { reject(new Error(data.error.message)); return; }
                        const choice = data.choices?.[0];
                        const raw = choice?.message?.content ?? '';
                        if (!raw) { reject(new Error(`OpenRouter ?묐떟 蹂몃Ц??鍮꾩뼱 ?덉뒿?덈떎. finish_reason=${choice?.finish_reason || 'unknown'}.`)); return; }
                        resolve(restoreProtectedBlocks(stripOuterFence(raw), protectedBlocks));
                    } catch (e) { reject(e); }
                },
                ontimeout() { reject(new Error('OpenRouter ?붿껌 ?쒓컙??珥덇낵?섏뿀?듬땲??')); },
                onerror() { reject(new Error('OpenRouter ?ㅽ듃?뚰겕 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.')); },
            });
        });
    }

    function callVertex(text, overrideModel = null, userContext = '') {
        return new Promise((resolve, reject) => {
            const accessToken = GM_getValue('vertexAccessToken', '').trim();
            if (!accessToken) { reject(new Error('Vertex AI 액세스 토큰이 설정되지 않았습니다.')); return; }
            const projectId = GM_getValue('vertexProject', '').trim();
            if (!projectId) { reject(new Error('Vertex AI 프로젝트 ID가 설정되지 않았습니다.')); return; }
            const location = GM_getValue('vertexLocation', DEFAULT_VERTEX_LOCATION).trim() || DEFAULT_VERTEX_LOCATION;
            const modelId = (overrideModel || GM_getValue('vertexModel', DEFAULT_VERTEX_MODEL)).trim();
            const { contextBlock, protectedBlocks } = buildCorrectionInput(text, userContext);
            const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(modelId)}:generateContent`;

            GM_xmlhttpRequest({
                method: 'POST',
                timeout: VERTEX_TIMEOUT_MS,
                url: endpoint,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                data: JSON.stringify({
                    system_instruction: { parts: [{ text: buildFinalPrompt() }] },
                    contents: [{ parts: [{ text: contextBlock }] }],
                    generationConfig: { temperature: 0.7, thinkingConfig: { thinkingLevel: 'Low' } },
                }),
                onload(res) {
                    try {
                        let data = {};
                        try { data = JSON.parse(res.responseText || '{}'); }
                        catch { reject(new Error(`Vertex AI 응답 JSON 파싱 실패. HTTP ${res.status}: ${(res.responseText || '(empty)').slice(0, 800)}`)); return; }
                        console.log('[초월 교정기 Vertex AI raw]', { status: res.status, statusText: res.statusText, model: modelId, response: data });
                        if (res.status < 200 || res.status >= 300) { reject(new Error(data?.error?.message || `Vertex AI API 오류 HTTP ${res.status}: ${(res.responseText || '(empty)').slice(0, 800)}`)); return; }
                        if (data.error) { reject(new Error(data.error.message || safeStringify(data.error))); return; }
                        const blockReason = data.promptFeedback?.blockReason;
                        if (blockReason) { reject(new Error(`Vertex AI 프롬프트 차단됨: ${blockReason}\n${safeStringify(data.promptFeedback?.safetyRatings || [])}`)); return; }
                        const candidate = data.candidates?.[0];
                        const finishReason = candidate?.finishReason || 'unknown';
                        const raw = getGeminiTextFromCandidate(candidate);
                        if (!raw.trim()) { reject(new Error(`Vertex AI 응답 본문이 비어 있습니다. finishReason=${finishReason}\n${safeStringify(candidate || null, 1200)}`)); return; }
                        resolve(restoreProtectedBlocks(stripOuterFence(raw), protectedBlocks));
                    } catch (e) { reject(e); }
                },
                ontimeout() { reject(new Error(`Vertex AI 요청 시간이 초과되었습니다. timeout=${VERTEX_TIMEOUT_MS}ms`)); },
                onerror(err) { reject(new Error(`Vertex AI 네트워크 오류가 발생했습니다: ${err?.error || 'unknown'}`)); },
            });
        });
    }
    function callCorrection(text, overrideModel = null, userContext = '', provider = GM_getValue('apiProvider', 'gemini')) {
        if (provider === 'deepseek') return callDeepSeek(text, overrideModel, userContext);
        if (provider === 'openrouter') return callOpenRouter(text, overrideModel, userContext);
        if (provider === 'vertex') return callVertex(text, overrideModel, userContext);
        return callGemini(text, overrideModel, userContext);
    }

    // =============================================
    //  eden-chat UI ?먮룞??    // =============================================
    function findLastUserMessage() {
        const msgs = document.querySelectorAll('div.hidden.lg\\:block.whitespace-pre-line.text-white');
        if (!msgs.length) return '';
        return Array.from(msgs[msgs.length - 1].querySelectorAll('span'))
            .map(s => s.textContent.trim())
            .filter(Boolean)
            .join('\n');
    }
    function isVisible(el) {
        if (!el || !el.isConnected) return false;
        const rect = el.getBoundingClientRect(); const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }
    function findMessageRoot(el) { return el?.closest?.('[data-message-id], article, main, section') || null; }
    function findLastPencilBtn() {
        const pencilBtns = Array.from(document.querySelectorAll('button[aria-label="?섏젙"]'))
            .filter(btn => isVisible(btn) && !btn.disabled && !isOwnUiElement(btn));
        return pencilBtns[pencilBtns.length - 1] || null;
    }
    function findEditArea(options = {}) {
        const requireText = options?.requireText === true;
        const candidates = Array.from(document.querySelectorAll('textarea'))
            .filter(el => isVisible(el) && !isOwnUiElement(el));
        const withText = candidates.filter(el => normalizeEditableText(el.value));
        if (requireText) return withText[withText.length - 1] || null;

        const exact = candidates.find(el => el.getAttribute('placeholder') === '硫붿떆吏 ?댁슜???낅젰?섏꽭??..');
        return withText[withText.length - 1] || exact || candidates[candidates.length - 1] || null;
    }    async function waitForElement(getter, timeout = 2500, interval = 100) {
        const started = Date.now(); let found = getter();
        while (!found && Date.now() - started < timeout) { await sleep(interval); found = getter(); }
        return found;
    }
    async function waitForEditAreaWithText(timeout = 3500, interval = 100) {
        return waitForElement(() => findEditArea({ requireText: true }), timeout, interval);
    }    function isOwnUiElement(el) { return !!el?.closest?.('#trans-setting-panel, #trans-result-modal, #trans-result-overlay, #trans-toast'); }
    function getButtonLabel(btn) { return [btn.textContent, btn.getAttribute('aria-label'), btn.getAttribute('title')].filter(Boolean).join(' '); }
    function isSaveLikeButton(btn) {
        const label = getButtonLabel(btn);
        const hasSaveIcon = !!btn.querySelector('.lucide-save, svg[class*="save"], svg[class*="Save"]');
        const hasSaveLabel = /save|done|confirm|apply/i.test(label);
        const hasCancelLabel = /cancel|close/i.test(label);
        return !hasCancelLabel && (hasSaveIcon || hasSaveLabel);
    }
    function findSaveBtn(scopeEl = null, tried = new Set()) {
        const scopes = []; const messageRoot = findMessageRoot(scopeEl);
        if (messageRoot) scopes.push(messageRoot); scopes.push(document);
        for (const scope of scopes) {
            const buttons = Array.from(scope.querySelectorAll('button')).filter(btn => isVisible(btn) && !btn.disabled && !isOwnUiElement(btn) && !tried.has(btn));
            const found = buttons.find(isSaveLikeButton); if (found) return found;
        }
        return null;
    }
    function isEditStillOpen(editArea) { return !!editArea?.isConnected && isVisible(editArea); }
    async function waitForEditClosed(editArea, timeout = 1500, interval = 100) {
        const started = Date.now();
        while (Date.now() - started < timeout) { if (!isEditStillOpen(editArea)) return true; await sleep(interval); }
        return !isEditStillOpen(editArea);
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
        throw new Error('援먯젙蹂몄? ?낅젰?먯?留??섏젙 ?뺤젙 踰꾪듉???꾨Ⅴ吏 紐삵뻽?듬땲?? eden-chat 踰꾪듉 援ъ“媛 諛붾?寃?媛숈뒿?덈떎.');
    }
    function normalizeEditableText(text) { return (text || '').replace(/\r\n/g, '\n').trim(); }
    function getEditableText(el) { return el?.tagName === 'TEXTAREA' ? el.value : el?.innerText || ''; }
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
            fireEditableEvents(el, text, 'insertText');
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
        let editArea = findEditArea({ requireText: true });
        if (!editArea) {
            const pencilBtn = findLastPencilBtn();
            if (!pencilBtn) throw new Error('?섏젙 踰꾪듉??李얠쓣 ???놁뒿?덈떎. 梨꾪똿 ?섏씠吏瑜??뺤씤?댁＜?몄슂.');
            pencilBtn.click(); editArea = await waitForEditAreaWithText();
        }
        if (!editArea) throw new Error('?몄쭛李쎌쓣 ?????놁뒿?덈떎.');
        let inserted = setEditableContent(editArea, translated);
        await sleep(250);
        if (!inserted || normalizeEditableText(getEditableText(editArea)) !== normalizeEditableText(translated)) { inserted = setEditableContent(editArea, translated); await sleep(250); }
        if (!inserted || normalizeEditableText(getEditableText(editArea)) !== normalizeEditableText(translated)) throw new Error('援먯젙蹂몄쓣 ?몄쭛李쎌뿉 ?ｌ? 紐삵뻽?듬땲?? eden-chat ?몄쭛李?援ъ“媛 諛붾?寃?媛숈뒿?덈떎.');
        await confirmEditedMessage(editArea); await sleep(600);
    }
    // =============================================
    //  紐⑤떖 ?곹깭 愿由?    // =============================================
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
            rerollBtn.innerText = 'Rerolling...'; rerollBtn.disabled = true;
            const newResult = await callCorrection(activeOriginalText, modalModelSelect.value, activeUserContext, activeApiProvider);
            transHistory.push(newResult); transIndex = transHistory.length - 1; updateModalState();
        } catch (e) { alert(e.message); }
        finally { rerollBtn.innerText = 'Reroll'; rerollBtn.disabled = false; }
    });
    patchModalBtn.addEventListener('click', async () => {
        if (!transHistory.length) return;
        try {
            patchModalBtn.innerText = 'Applying...'; patchModalBtn.disabled = true;
            await applyTranslation(transHistory[transIndex]);
            patchModalBtn.innerText = '援먯껜 ?꾨즺! ?뷂툘';
            setTimeout(() => { closeResultModal(); patchModalBtn.disabled = false; patchModalBtn.innerText = '??寃곌낵濡?援먯껜?섍린'; }, 2000);
        } catch (e) { alert(e.message); patchModalBtn.innerText = 'Apply'; patchModalBtn.disabled = false; }
    });

    // =============================================
    //  硫붿씤 援먯젙 濡쒖쭅
    // =============================================
    async function autoCorrect(options = {}) {
        const forceAutoReplace = options?.forceAutoReplace === true;
        if (!isChattingPage()) { showToast('梨꾪똿諛??섏씠吏?먯꽌留??ъ슜 媛?ν빀?덈떎.'); return; }
        const currentProvider = providerSelect.value || 'gemini';
        saveProviderFields(currentProvider);
        GM_setValue('apiProvider', currentProvider);
        GM_setValue('showPreview', autoReplaceToggle.getAttribute('aria-checked') !== 'true');
        GM_setValue('promptMode', 'custom');
        GM_setValue('customPrompt', customPromptInput.value);
        activeApiProvider = currentProvider;

        if (!getSavedApiKey(currentProvider).trim()) { setStatus(`${getProviderDisplayName(currentProvider)} API ?ㅺ? ?ㅼ젙?섏? ?딆븯?듬땲?? ????ぉ?먯꽌 ?낅젰 ????ν빐二쇱꽭??`, 'err'); return; }
        translateBtn.disabled = true; quickBtn.disabled = true; clearStatus();

        try {
            setStatus('Entering edit mode...', 'info');
            const pencilBtn = findLastPencilBtn();
            if (!pencilBtn) throw new Error('AI 硫붿떆吏???섏젙 踰꾪듉??李얠쓣 ???놁뒿?덈떎. 留덉슦?ㅻ? AI 硫붿떆吏 ?꾩뿉 ?щ젮 ?먯꽭??');
            const userContext = findLastUserMessage();
            pencilBtn.click();
            const editArea = await waitForEditAreaWithText();
            if (!editArea) throw new Error('?몄쭛李?蹂몃Ц??李얠? 紐삵뻽?듬땲?? eden-chat ?섏젙李쎌씠 ?대졇?붿? ?뺤씤?댁＜?몄슂.');
            const original = getEditableText(editArea).trim();
            if (!original) throw new Error('援먯젙???댁슜???놁뒿?덈떎.');
            activeOriginalText = original; activeUserContext = userContext;

            const usePreview = !forceAutoReplace && autoReplaceToggle.getAttribute('aria-checked') !== 'true';
            if (usePreview) {
                editArea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
                await sleep(400);
                setStatus('??援먯젙 以묅?(Gemini???ㅽ뙣 ???먮룞 ?ъ떆?꾪빀?덈떎)', 'info');
                const corrected = await callCorrection(original, null, userContext, currentProvider);
                transHistory = [corrected]; transIndex = 0; modalModelSelect.value = getSavedModel(currentProvider);
                panel.style.display = 'none'; overlay.style.display = 'block'; resultModal.style.display = 'flex'; updateModalState();
            } else {
                setStatus('??援먯젙 以묅?(Gemini???ㅽ뙣 ???먮룞 ?ъ떆?꾪빀?덈떎)', 'info');
                const corrected = await callCorrection(original, null, userContext, currentProvider);
                setStatus('Entering edit mode...', 'info');
                await applyTranslation(corrected);
                setStatus('??援먯젙 援먯껜 ?꾨즺!', 'ok');
                setTimeout(() => { panel.style.display = 'none'; clearStatus(); }, 900);
            }
        } catch (err) {
            setStatus(`??${err.message}`, 'err');
            console.error('[珥덉썡 援먯젙湲?eden-chat v4.1]', err);
        } finally {
            translateBtn.disabled = false; quickBtn.disabled = false;
        }
    }

    // =============================================
    //  ?ㅼ젙 ?⑤꼸 ?대깽??    // =============================================
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
    resetBtn.addEventListener('click', () => { if (confirm('援먯젙 吏移⑥꽌瑜?湲곕낯媛믪쑝濡?珥덇린?뷀븷源뚯슂?')) resetCustomPrompt(); });
    saveBtn.addEventListener('click', () => {
        saveProviderFields(providerSelect.value);
        GM_setValue('apiProvider', providerSelect.value);
        GM_setValue('showPreview', autoReplaceToggle.getAttribute('aria-checked') !== 'true');
        GM_setValue('promptMode', 'custom');
        GM_setValue('customPrompt', customPromptInput.value);
        saveBtn.textContent = 'Saved!'; setTimeout(() => { saveBtn.textContent = 'Save'; }, 1200);
    });
    translateBtn.addEventListener('click', autoCorrect);
    quickBtn.addEventListener('click', (e) => { if (dragMoved) { e.preventDefault(); e.stopPropagation(); return; } autoCorrect({ forceAutoReplace: true }); });

    // =============================================
    //  援먯젙 踰꾪듉 ?쒖떆 ?쒖뼱 (SPA ?쇱슦?????
    // =============================================
    function syncTranslateBtn() {
        const visible = isChattingPage();
        translateBtn.style.display = visible ? 'inline-block' : 'none';
        quickBtn.style.display = visible ? 'flex' : 'none';
    }
    syncTranslateBtn();
    let _lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== _lastUrl) { _lastUrl = location.href; setTimeout(syncTranslateBtn, 800); }
    }).observe(document, { subtree: true, childList: true });
    setInterval(syncTranslateBtn, 2000);

})();









