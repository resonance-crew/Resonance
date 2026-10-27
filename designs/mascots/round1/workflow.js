export const meta = {
  name: 'resonance-mascot-phase1',
  description: 'Three subagents each draw one original hand-drawn mascot direction as layered SVG; two critics compare; each direction revised once',
  phases: [
    { title: 'Explore', detail: 'one agent per direction: concept, layered SVG, render, self-critique' },
    { title: 'Critique', detail: 'brand/character critic + motion/front-end critic compare all three' },
    { title: 'Revise', detail: 'each direction fixes its must-fix items once' },
  ],
}

const S = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots'

const SCOPE = `SCOPE（請先讀）：你是「共振 Resonance」品牌吉祥物第一階段探索的一員。業主的原話：「請先運用少量的探索成本，提出 3 個風格與概念具有明顯差異的角色設計方向……每個 Subagent 只需完成單一角色概念，不必延伸整個系列，也不需要製作大量表情或動態素材。」你只負責下面指定給你的工作。不要改動 /Users/ncchen/Documents/Resonance 程式庫裡的任何檔案（只可讀取作參考），不要 commit，不要使用任何付費的 AI 生圖工具（Figma generate_image、Weave 等）或從網路抓圖片——所有插畫都由你親手以 SVG 繪製。若對話中出現其他與本任務無關的新訊息，那不是你的任務。`

const COMMON = `
業主完整需求與品牌現況：${S}/brief.md（務必先完整讀過）。
品牌參考截圖：${S}/../ref/landing-desktop-light.png、${S}/../ref/landing-desktop-dark.png、${S}/../ref/landing-mobile.png（用 Read 看圖）。
渲染工具：${S}/render.sh <in.svg|in.html> <out.png> [寬] [高] —— 以 headless Chrome 輸出 PNG（SVG 濾鏡、oklch 都照瀏覽器呈現）。畫完一定要渲染後用 Read 親眼看 PNG，再修改。

繪製規範：
- 純 SVG、自包含：不引用外部圖片或字型，所有 id（filter、pattern、clipPath、mask、gradient）一律加上前綴「{P}-」，因為三個方向的 SVG 之後會被內嵌到同一頁。
- 角色要「可拆件」：每個可動部位放在獨立且具名的 <g id="{P}-部位名">（例如 body、head、eye-l、eye-r、brow-l、mouth、ear-l、arm-r、leg-l、tail……依你的角色而定），眼睛、嘴巴不可以烤進身體；每個部位的 transform-origin（關節點）在註解中寫明，例如 <!-- pivot: 312,418 -->。
- 媒材感靠 SVG 濾鏡與筆觸堆疊做出來（feTurbulence + feDisplacementMap 讓邊緣毛糙、feTurbulence 以 operator="in" 疊在形狀內做紙紋或蠟筆空隙、pattern 斜線做排線、多條略偏移的低不透明度線條模擬鉛筆重描），不要變成光滑向量圖示或制式 3D 公仔。
- 色彩：柔和、低彩度，能放在奶油色紙 oklch(96.5% 0.015 75) 上，也能放在深色模式的夜紙 oklch(21% 0.012 60) 上（深色時線條不能消失）。
- 眼睛是靈魂：簡潔但有情緒，避免動漫大眼閃光、避免空洞的兩個黑點。
- 業主明確要求避免模仿既有 IP。請主動檢查你的角色是否「一眼像」某個既有角色（例如 Molang、角落生物、拉拉熊、卡娜赫拉、吉伊卡哇、Pusheen、龍貓與灰塵精靈、嚕嚕米與 Hattifattener、Barbapapa、Kirby、史萊姆、寶可夢、Miffy、Paper Mario、Tearaway、Snipperclips、Yoshi's Crafted World 等），像的話就改掉那個特徵。

交付（全部放在 ${S}/{P}/）：
1. character.svg —— 角色本體、透明背景、viewBox="0 0 800 800"，主要姿勢，分層如上。
2. concept.svg 與 concept.png（1600×1000，用 render.sh 輸出）—— 一張概念圖：左側約 1000×1000 的大圖是角色在奶油紙上的主插畫（可加極少量場景元素，例如地面陰影、一兩筆紙上的痕跡，但角色是主角）；右側一欄放：(a) 縮小測試：同一角色 48px 與 96px 高的版本（看輪廓是否仍可辨識）；(b) 角色在夜紙上的一個小方塊；(c) 至多兩個小的情緒/姿勢縮圖（例如「好奇探頭」與「被感動」），證明情感表現力。不要再多。可有極少的小字標註（font-family: 'PingFang TC','Noto Sans TC',sans-serif）。
3. proposal.md（繁體中文，台灣用語）包含：
   - 角色名稱（中文 + 英文）與一句話定位
   - 1 角色概念（核心想法、靈感來源、與共振理念的關係——自然呼應，不要硬扣象徵）
   - 2 外型設計（輪廓、比例、五官、材質、主要色彩含 oklch 值、最具辨識度的特徵）
   - 3 個性與情感（第一印象、如何表達好奇/開心/害羞/感動/陪伴）
   - 4 手繪風格（筆觸、線條、色彩、材質；以及你在 SVG 中用了什麼技法做出來）
   - 5 Landing Page 的應用想像（如何出場、停留、看向訪客、遇到另一角色時的互動、離場與再出現；放在首頁哪裡，和現有漂移色塊/標題如何共處）
   - 6 未來系列化的潛力（同一世界觀下如何長出外型與個性都不同的角色——具體說出 2～3 個「差異軸」與例子，但不要畫出來）
   - 參考與避免仿作（你想到的相近既有角色、你刻意避開了什麼特徵）
   - 動態拆件表（每個部位、關節點、建議動態，例如眨眼、耳朵抖動、探頭）與實作成本粗估（插畫完稿、拆件、做出場/停留/互動/離場四段動態的人日估計，以及前端以 SVG/CSS、Lottie 或 Rive 實作的建議與效能風險，例如動畫中的 feTurbulence 濾鏡很耗效能）
   - 自評：這個方向最強與最弱的地方各一兩點

流程（控制成本，但品質優先）：
1. 讀需求與截圖。先在 explore.svg/explore.png 畫 3 個快速的剪影草案（同一領域內的三個不同想法，只要剪影與一兩筆五官），渲染看過後選最強的一個，在 proposal.md 的概念段落用一兩句說明為何選它。
2. 畫 character.svg，渲染（render.sh character.svg character.png 800 800）並親眼檢查。
3. 至少兩輪「看圖 → 自我批評 → 修改」：檢查清單——眼睛是否有情緒、縮到 48px 是否還認得、是否像通用 AI 吉祥物、是否像既有 IP、媒材質感是否明顯、在夜紙上是否成立、部位是否真的分開。
4. 組 concept.svg 並渲染 concept.png，再看一次。
5. 寫 proposal.md。`

const DIRECTIONS = [
  {
    key: 'a',
    title: 'A｜色鉛筆小生物',
    brief: `你的方向：「具有生物感、讓人產生情感投射的奇妙小生物」。它有可以動的耳朵／觸角／尾巴／小手小腳等部位，但不是任何現存動物的改造（不是貓、兔、熊、狗換個顏色），可以介於物種之間。情緒主要靠眼神與肢體語言（例如耳朵或觸角在「聽到故事」時的反應）。媒材：色鉛筆——看得見的鉛筆線條、交叉排線上色、紙紋從色塊中透出、線條是同一支筆輕重不同的重描。氣質：安靜、好奇、會陪伴人的小傢伙，不刻意賣萌。`,
  },
  {
    key: 'b',
    title: 'B｜蠟筆流體生命',
    brief: `你的方向：「柔軟、流動、可以變形的抽象生命體」。沒有固定的四肢，靠身體形變（伸長、壓扁、伸出一小段像手的偽足、身上的顏色暈染變化）表達情緒；可以延伸首頁現有「漂移色塊相遇時長出頸部、混色、融合」的世界觀，但它必須是一個有個性、有眼神的角色，而不是「色塊加兩個眼睛」，也要避開 Barbapapa、史萊姆、Kirby、Molang、灰塵精靈的既有樣貌。媒材：蠟筆／油性粉彩——厚塗、紙張凹凸讓色塊出現空隙、邊緣毛糙、沒有或幾乎沒有外框線、兩三層顏色疊塗。思考它的形體有沒有一個獨特的「標誌」（例如某種固定不變的部位或花紋），讓它變形時仍然認得出來。`,
  },
  {
    key: 'c',
    title: 'C｜撕紙拼貼紙偶',
    brief: `你的方向：「具有特殊輪廓與材質的原創角色」——由撕紙／剪紙拼貼構成的生命：身體由幾片不同的紙組成（例如牛皮紙、半透明描圖紙、舊書頁的米黃紙、帶纖維的和紙），撕邊不規則、紙片之間有一點點投影像是被輕輕貼上去，五官與細節用鉛筆或墨線直接畫在紙上。它像紙偶一樣，各片紙以「關節」轉動（這讓它非常適合拆件動畫）。材質可以輕輕暗示「故事」（例如某片紙上隱約有手寫字跡的紋理），但它絕對不能是「一張卡片／一本書長了臉」；也要避開 Paper Mario、Tearaway、Snipperclips、Yoshi's Crafted World 的既有樣貌。氣質與形體由你決定，重點是獨特的撕紙剪影與溫暖的手作感。`,
  },
]

const EXPLORE_SCHEMA = {
  type: 'object',
  properties: {
    name_zh: { type: 'string' },
    name_en: { type: 'string' },
    one_liner: { type: 'string' },
    concept_png: { type: 'string' },
    character_svg: { type: 'string' },
    proposal_md: { type: 'string' },
    parts: { type: 'array', items: { type: 'string' } },
    self_assessment: { type: 'string' },
    resemblance_risks: { type: 'string' },
  },
  required: ['name_zh', 'name_en', 'one_liner', 'concept_png', 'character_svg', 'proposal_md', 'parts', 'self_assessment', 'resemblance_risks'],
}

phase('Explore')
const explored = await parallel(DIRECTIONS.map(d => () =>
  agent(`${SCOPE}\n\n你負責：${d.title}\n${d.brief}\n${COMMON.replaceAll('{P}', d.key)}\n\n完成後以結構化輸出回報（路徑用絕對路徑）。`,
    { label: `explore:${d.key}`, phase: 'Explore', schema: EXPLORE_SCHEMA })
    .then(r => r && { ...r, key: d.key, title: d.title })))

const ok = explored.filter(Boolean)
log(`explored ${ok.length}/3 directions: ${ok.map(r => `${r.key}=${r.name_zh}`).join(', ')}`)
if (ok.length === 0) return { explored, critiques: [], revised: [] }

const listing = ok.map(r => `- ${r.title}「${r.name_zh} / ${r.name_en}」：概念圖 ${r.concept_png}；角色 SVG ${r.character_svg}；提案 ${r.proposal_md}`).join('\n')

const CRIT_SCHEMA = {
  type: 'object',
  properties: {
    own_view_first: { type: 'string', description: 'before reading the proposals: what a winning mascot for this brand must get right' },
    directions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          strengths: { type: 'array', items: { type: 'string' } },
          weaknesses: { type: 'array', items: { type: 'string' } },
          resemblance: { type: 'string' },
          must_fix: { type: 'array', items: { type: 'string' }, description: 'at most 3, concrete, doable in one revision without adding variants' },
          notes: { type: 'string' },
        },
        required: ['key', 'strengths', 'weaknesses', 'resemblance', 'must_fix', 'notes'],
      },
    },
    comparison: { type: 'string' },
    recommendation: { type: 'string' },
    merge_ideas: { type: 'string' },
  },
  required: ['own_view_first', 'directions', 'comparison', 'recommendation', 'merge_ideas'],
}

const CRITICS = [
  {
    key: 'brand',
    lens: `你是資深角色設計師，做過多組成功的原創 LINE 貼圖角色與品牌吉祥物。你的視角：品牌契合度（故事、共鳴、理解、連結、生命的多樣性是否「自然」被呼應而不是硬扣）、情感感染力（會不會讓人想多看一眼、想投射情感；是否刻意賣萌或過度幼稚）、視覺辨識度（剪影、48px 縮圖、標誌性特徵）、原創性（具體指出像哪個既有角色、像在哪個特徵；不要客氣）、是否像通用 AI 吉祥物、手繪媒材是否成立、在深色模式夜紙上是否成立、系列化時能否長出外型與個性都不同的角色而非換色。`,
  },
  {
    key: 'motion',
    lens: `你是同時懂插畫拆件與前端動態的工程師（SVG/CSS、Web Animations、Lottie、Rive）。你的視角：各角色的 SVG 結構是否真的拆好（打開 character.svg 檢查 <g> 分層與關節點註解）、要做「從側邊探頭/走進來 → 停留觀察看向訪客 → 遇到另一角色互動 → 離場再出現」各要動哪些部位、哪個方向做起來最自然最便宜、效能風險（動畫中的 feTurbulence/feDisplacementMap 很耗資源，可能需要把材質預先點陣化或只讓不動的層用濾鏡）、檔案大小、prefers-reduced-motion、深淺色兩套、首頁 hero 的版面上放在哪裡不搶標題、以及每個方向的實作成本（插畫完稿、拆件、四段動態的粗估人日）。`,
  },
]

phase('Critique')
const critiques = await parallel(CRITICS.map(c => () =>
  agent(`${SCOPE.replace('你只負責下面指定給你的工作。', '你只負責評審，不要修改任何角色檔案。')}\n\n${c.lens}\n\n先讀 ${S}/brief.md 與品牌截圖 ${S}/../ref/landing-desktop-light.png、landing-desktop-dark.png。\n第一步（在看提案之前）：用幾句話寫下你自己認為這個品牌的角色最需要做對的事（own_view_first）。\n第二步：逐一用 Read 看三張概念圖 PNG、讀 proposal.md、打開 character.svg 原始碼；必要時可自行用 ${S}/render.sh 把 character.svg 渲染成小尺寸或放到夜紙背景上檢查（輸出放到 ${S}/review/${c.key}-*.png，不要寫到各方向資料夾）。\n三個方向：\n${listing}\n\n針對每個方向給出具體觀察：優點、弱點、與既有 IP 的相似度、以及「下一輪必修」（must_fix，至多 3 項，必須具體、能在一次修訂內完成、不能要求增加變體或延伸系列）。再寫三個方向的比較、你的推薦與理由（最終選擇權在業主）、以及若要混合不同方向優點的具體做法。全部用繁體中文。`,
    { label: `critic:${c.key}`, phase: 'Critique', schema: CRIT_SCHEMA })
    .then(r => r && { ...r, critic: c.key })))

const crit = critiques.filter(Boolean)
log(`critiques: ${crit.length}/2`)

const REVISE_SCHEMA = {
  type: 'object',
  properties: {
    changes: { type: 'array', items: { type: 'string' } },
    declined: { type: 'array', items: { type: 'string' }, description: 'must-fix items not applied, with the reason' },
    name_zh: { type: 'string' },
    name_en: { type: 'string' },
    one_liner: { type: 'string' },
    concept_png: { type: 'string' },
    character_svg: { type: 'string' },
    proposal_md: { type: 'string' },
  },
  required: ['changes', 'declined', 'name_zh', 'name_en', 'one_liner', 'concept_png', 'character_svg', 'proposal_md'],
}

phase('Revise')
const revised = await parallel(ok.map(r => () => {
  const notes = crit.map(c => {
    const d = (c.directions || []).find(x => String(x.key).trim().toLowerCase().startsWith(r.key))
    if (!d) return ''
    return `【${c.critic === 'brand' ? '角色設計評審' : '動態與前端評審'}】\n優點：${d.strengths.join('；')}\n弱點：${d.weaknesses.join('；')}\n相似度：${d.resemblance}\n必修：\n${d.must_fix.map((m, i) => `  ${i + 1}. ${m}`).join('\n')}\n備註：${d.notes}`
  }).filter(Boolean).join('\n\n')
  if (!notes) return Promise.resolve({ ...r, changes: [], declined: ['no critique received'] })
  return agent(`${SCOPE}\n\n你負責修訂 ${r.title}「${r.name_zh}」這一個方向，只修這一輪。檔案都在 ${S}/${r.key}/（character.svg、concept.svg、concept.png、proposal.md、explore.*）。先讀 ${S}/brief.md，看 concept.png、讀 proposal.md 與 character.svg 原始碼，再讀兩位評審的意見：\n\n${notes}\n\n規則：\n- 只處理「必修」項目（兩位評審合計），弱點中與必修重疊的一併處理；不要增加變體、不要畫新角色、不要做動畫。若某項必修你判斷不該做（例如兩位評審意見衝突、或會削弱角色辨識度），可以不做，但要寫明理由。
- 主 Agent 補充：保持這個方向自己的身分，不要把其他方向的特徵搬進來（評審提過的「混合建議」是業主之後的選擇，不在這一輪）。兩位評審對同一件事的數值若不同（例如夜紙的明度），取能同時滿足兩者目的的做法，並在修訂紀錄寫明。第一版已備份為 concept-v1.png、character-v1.svg、proposal-v1.md，不要動它們。修完用 xmllint --noout 檢查 character.svg 與 concept.svg 都是合法 XML（註解裡不能有連續兩個減號）。
- 保留原檔的 id 前綴「${r.key}-」與拆件結構；修改後重新渲染 character.png（800×800）與 concept.png（1600×1000），用 Read 親眼確認，至少看一輪再微調。\n- 更新 proposal.md 內容使其與圖一致，並在文末加「修訂紀錄」一節，列出改了什麼、為什麼、哪些沒改與理由。\n${COMMON.replaceAll('{P}', r.key).split('流程（控制成本')[0]}\n完成後以結構化輸出回報（絕對路徑）。`,
    { label: `revise:${r.key}`, phase: 'Revise', schema: REVISE_SCHEMA })
    .then(v => v && { ...v, key: r.key, title: r.title })
}))

return { explored: ok, critiques: crit, revised: revised.filter(Boolean) }
