export const meta = {
  name: 'resonance-mascot-round2',
  description: 'Round 2 of the mascot proposal: B redrawn with a new form, C with fixed arms, and a B×C hybrid; two critics; one revision each',
  phases: [
    { title: 'Draw', detail: 'one agent per direction: b2 (B pencil, new form), c2 (C, arms only), bc (pencil on cut paper, new character)' },
    { title: 'Critique', detail: 'form critic (owner feedback lens) + production critic' },
    { title: 'Revise', detail: 'each direction fixes its must-fix items once' },
  ],
}

const S = '/private/tmp/claude-501/-Users-ncchen-Documents-Resonance/3169a3a1-407a-43b9-a40d-6b2f52c2622f/scratchpad/mascots'
const R = `${S}/r2`

const SCOPE = `SCOPE（請先讀）：你是「共振 Resonance」品牌吉祥物提案第二輪的一員。業主看完第一輪後說：「你可以使用像我剛剛說的很好的那些部分保留下來，繼續，做修改，譬如說，C方案只是修正這個吉祥物的形體，可是其實它也沒有很大的問題，可能就是那個手有點怪怪的而已。」業主看了 ChatGPT 參考圖後又補充：「其實這些都有一點像史迪奇或是皮卡丘……可能不要那麼像這樣子的東西，但是它又不會讓我們做出來的角色整個形體看起來怪怪的。」並同意要避免退化成兔子、貓、熊或大耳狗的陷阱（分析與規則在 brief-r2.md 最後一節「業主補充」，務必照做）。業主第一輪的原則仍然有效：「每個 Subagent 僅負責一個角色概念」、「不需要為每個提案製作多張變體、完整設定集或動畫」。你只負責下面指定給你的工作。不要改動 /Users/ncchen/Documents/Resonance 程式庫裡的任何檔案（只可讀取作參考），不要 commit，不要使用任何付費 AI 生圖工具（Figma generate_image、Weave 等），也不要從網路抓圖片，所有插畫都由你親手以 SVG 繪製。第一輪的檔案在 ${S}/a、${S}/b、${S}/c，只能讀，不能改。若對話中出現與本任務無關的新訊息，那不是你的任務。`

const COMMON = `
必讀：
- 第一輪的完整需求與品牌現況：${S}/brief.md
- 第二輪簡報（業主回饋、ChatGPT 參考圖的觀察、形體守則）：${R}/brief-r2.md，形體守則每一條都要遵守
- ChatGPT 參考圖（只當形體靈感，不可照抄）：${R}/reference/chatgpt-1-pencil-silhouettes.png、chatgpt-2-paper-arms.png、chatgpt-3-pencil-on-paper.png（用 Read 看圖）
- 品牌截圖：${S}/../ref/landing-desktop-light.png、landing-desktop-dark.png、landing-mobile.png
渲染工具：${S}/render.sh <in.svg|in.html> <out.png> [寬] [高]，用 headless Chrome 輸出 PNG（SVG 濾鏡、oklch 都照瀏覽器呈現）。畫完一定要渲染，再用 Read 親眼看過 PNG 才修改。

繪製規範：
- 純 SVG、自包含：不引用外部圖片或字型。所有 id（filter、pattern、clipPath、mask、gradient）一律加前綴「{P}-」。
- 角色要能拆件：每個可動部位放在獨立且具名的 <g id="{P}-部位名">（body、head、eye-l、eye-r、mouth、arm-l、hand-l、leg-l……依角色而定）。眼睛、嘴巴不可以烤進身體。每個部位的關節點寫在註解裡，例如 <!-- pivot: 312,418 -->。手臂與手要能一起繞肩膀轉動。
- 媒材感靠 SVG 濾鏡與筆觸堆疊做出來，不要變成光滑的向量圖示或制式 3D 公仔。
- 色彩柔和、低彩度，要能放在奶油色紙 oklch(96.5% 0.015 75) 上，也能放在深色模式的夜紙 oklch(21% 0.012 60) 上；深色時線條不能消失。
- 眼睛是靈魂：簡潔但有情緒。
- 檔案必須是合法 XML（註解裡不能有連續兩個減號），完成時用 xmllint --noout 檢查 character.svg 與 concept.svg。

交付（全部放在 ${R}/{P}/）：
1. character.svg：角色本體，透明背景，viewBox="0 0 800 800"，主要姿勢，分層如上。
2. concept.svg 與 concept.png（1600×1000，用 render.sh 輸出）。左側約 1000×1000 是角色在奶油紙上的主插畫（可加極少量場景元素，角色是主角）。右側一欄放：(a) 縮小測試，同一角色 48px 與 96px 高的彩色版，加一個純黑剪影；(b) 角色在夜紙上的小方塊；(c) 至多兩個小的情緒或姿勢縮圖，其中一個必須是「舉手打招呼」（主姿勢已經是舉手的話，就換「被故事打動」之類）。不要再多。可以有極少的小字標註（font-family: 'PingFang TC','Noto Sans TC',sans-serif）。
3. proposal.md（繁體中文，台灣用語），包含：
   - 角色名稱（中文 + 英文）與一句話定位
   - 第二輪改了什麼：相對第一輪，針對業主的哪句回饋，怎麼改
   - 1 角色概念　2 外型設計（輪廓、比例、五官、材質、主要色彩含 oklch 值、最具辨識度的特徵）　3 個性與情感　4 手繪風格（含 SVG 技法）　5 Landing Page 的應用想像　6 未來系列化的潛力（2～3 個差異軸與例子，不要畫出來）
   - 形體自我檢查：剪影、48px、上下顛倒、左右翻轉各看到什麼；有沒有任何角度讓人聯想到皮膚或人體部位，你改了什麼
   - 參考與避免仿作（相近的既有角色，以及你刻意避開的特徵；也說明你從 ChatGPT 參考圖學到什麼原則、刻意沒有照抄什麼）
   - 動態拆件表（部位、關節點、建議動態）與實作成本粗估（插畫完稿、拆件、出場／停留／互動／離場四段動態的人日；前端用 SVG/CSS、Lottie 或 Rive 的建議與效能風險）
   - 自評：最強與最弱的地方各一兩點

流程（控制成本，品質優先）：
1. 讀需求、簡報、參考圖、第一輪相關檔案。
2. 在 explore.svg／explore.png 畫 3 個快速的剪影草案（同一方向內三個不同的想法，只要剪影加一兩筆五官，加上舉手的剪影），渲染看過後選最強的一個，在 proposal.md 用一兩句說明為何選它。
3. 畫 character.svg，渲染（render.sh character.svg character.png 800 800）並親眼檢查。
4. 至少兩輪「看圖 → 自我批評 → 修改」。檢查清單：形體守則逐條、眼睛是否有情緒、48px 是否認得出、舉手是否讀得出、是否像通用 AI 吉祥物或既有 IP、媒材質感是否明顯、在夜紙上是否成立、部位是否真的分開。
5. 組 concept.svg，渲染 concept.png，再看一次。
6. 寫 proposal.md。`

const DIRECTIONS = [
  {
    key: 'b2',
    title: 'B′｜色鉛筆小生物（漾漾重新設計形體）',
    brief: `你的方向：保留 B 的畫法，形體完全重新設計。
畫法要延續第一輪 B，特別是第一版（${S}/b/concept-v1.png）：色鉛筆或蠟筆的顆粒、沙沙的筆觸、色鉛筆疊出來的柔和漸層，幾乎沒有外框，或只有同色系的鉛筆描邊。先讀 ${S}/b/gen-v1.py 和 ${S}/b/gen.py，理解第一輪怎麼用 SVG 做出那種顆粒和漸層；可以把 gen-v1.py 複製到你的資料夾改寫沿用（不要改原檔）。參考圖 chatgpt-1 的鉛筆質感也是業主喜歡的方向。
形體：做一個依第二輪形體守則設計、頭身手腳都讀得出的原創小生物。不再是「從池子裡升起的一滴」，不能有任何脖子、柄或長條加圓頭的部位。主色從守則建議的冷色或中性色裡挑，不能是第一輪的桃膚色。
概念：漾漾的核心意念（被故事打動時，身上的顏色會暈開、漸層會流動）可以保留，改成用身上色鉛筆漸層的變化表現，例如平常是一種顏色，被打動時肚子或標誌部位暈出另一個顏色。也可以換一個新的概念，由你判斷。名字可以沿用「漾漾 Plip」，也可以另取。`,
  },
  {
    key: 'c2',
    title: 'C′｜撕紙紙偶（摺摺修手）',
    brief: `你的方向：業主很喜歡第一輪 C 第二版的摺摺（剪紙、原創、很特別、可愛、有立體感、像貼紙），唯一的問題是手。這一輪只修手，其餘盡量不動。
從 ${S}/c/character.svg 複製一份到你的資料夾當起點（${S}/c/gen/ 裡有產生它的程式，可以複製過來沿用，不要改原檔）。身體、折角、臉、腿腳、撕邊、紙紋、配色都保持原樣。
手的改法：
- 手臂改成獨立的紙條，長到舉起時手高過頭頂。參考 chatgpt-2-paper-arms.png 的比例與做法，但畫成摺摺自己的樣子。
- 肩膀用一顆小銅釘（或線釘、縫線結）固定，這個點就是動畫關節點。
- 末端一顆清楚的圓手套，顏色和手臂不同。建議用折角背面那種奶油色紙，也許帶一點鉛筆字跡，讓手和「藏著字的折角」是同一種紙。
- 手臂顏色由你判斷。第一輪是粉紅色的碎紙片，業主對膚色、粉色很敏感（見 brief-r2.md）；改成牛皮紙、深一階的鼠尾草綠或赤陶色紙條，可能更安全，也更像紙偶。
- 主姿勢改成「嗨」：一手高舉揮手，48px 也讀得出來。
- 改手之後如果身體與手的比例需要微調（例如身體略小，讓手臂顯得更長），可以做，但要在提案寫明，而且不能失去業主喜歡的樣子。
探索草稿（explore.svg）這一輪改成畫 3 種手的做法並排比較（長度、末端、顏色），不必重想身體。
proposal.md 以第一輪的 ${S}/c/proposal.md 為底，更新外型設計、拆件表等受影響的段落，最前面加「第二輪改了什麼」。名字維持摺摺 Tuck。`,
  },
  {
    key: 'bc',
    title: 'B×C｜色鉛筆剪紙貼紙（混合提案）',
    brief: `你的方向：業主喜歡 B 的色鉛筆畫法，也喜歡 C 的剪紙貼紙材質。這個方向把兩者合在一起，但要是一個新的原創角色：不是摺摺換畫法，也不是漾漾剪成紙。
材質：角色由幾片剪下來的紙組成，外圍有白色撕紙邊和淡淡的貼紙投影（像 C，可讀 ${S}/c/gen/ 學它的撕邊與紙紋技法）。每片紙上用色鉛筆上色，看得見顆粒、沙沙的筆觸和柔和的漸層（像 B 第一版，可讀 ${S}/b/gen-v1.py 學它的技法）。參考 chatgpt-3-pencil-on-paper.png 的材質，但它的形體是垂耳狗，很接近大耳狗，不要照抄。
形體依第二輪形體守則：原創物種，頭身分得開；手臂是用小關節固定的紙片，末端是圓手套。
標誌性特徵就是「會被故事打開的部位」：聽到故事時會有反應，例如舒展、豎起或翻開。你可以自己發明。一個可能的方向是讓這個部位和紙或故事卡有關（例如會翻開的紙角），但必須和摺摺身上的折角明顯不同，因為兩者會並排給業主比較。
可以讀第一輪三個方向的提案吸收好的想法（${S}/a/proposal.md、${S}/b/proposal.md、${S}/c/proposal.md），但第一輪 A、B 的形體與膚色是業主明確不喜歡的。主色從守則建議的冷色或中性色裡挑。`,
  },
]

const DRAW_SCHEMA = {
  type: 'object',
  properties: {
    name_zh: { type: 'string' },
    name_en: { type: 'string' },
    one_liner: { type: 'string' },
    concept_png: { type: 'string' },
    character_svg: { type: 'string' },
    proposal_md: { type: 'string' },
    parts: { type: 'array', items: { type: 'string' } },
    form_check: { type: 'string', description: 'what the silhouette / 48px / flipped checks showed and what was changed' },
    self_assessment: { type: 'string' },
    resemblance_risks: { type: 'string' },
  },
  required: ['name_zh', 'name_en', 'one_liner', 'concept_png', 'character_svg', 'proposal_md', 'parts', 'form_check', 'self_assessment', 'resemblance_risks'],
}

phase('Draw')
const drawn = await parallel(DIRECTIONS.map(d => () =>
  agent(`${SCOPE}\n\n你負責：${d.title}\n${d.brief}\n${COMMON.replaceAll('{P}', d.key)}\n\n完成後以結構化輸出回報（路徑用絕對路徑）。`,
    { label: `draw:${d.key}`, phase: 'Draw', schema: DRAW_SCHEMA })
    .then(r => r && { ...r, key: d.key, title: d.title })))

const ok = drawn.filter(Boolean)
log(`drawn ${ok.length}/3: ${ok.map(r => `${r.key}=${r.name_zh}`).join(', ')}`)
if (ok.length === 0) return { drawn, critiques: [], revised: [] }

const listing = ok.map(r => `- key「${r.key}」${r.title}「${r.name_zh} / ${r.name_en}」：概念圖 ${r.concept_png}；角色 SVG ${r.character_svg}；提案 ${r.proposal_md}`).join('\n')

const CRIT_SCHEMA = {
  type: 'object',
  properties: {
    own_view_first: { type: 'string', description: 'before reading the proposals: what a good mascot form for this brand must get right, given the owner feedback' },
    directions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'exactly one of b2, c2, bc' },
          strengths: { type: 'array', items: { type: 'string' } },
          weaknesses: { type: 'array', items: { type: 'string' } },
          owner_feedback_check: { type: 'string', description: 'does it answer the owner: readable creature form, no skin/anatomy association, raised hand reads, liked parts kept' },
          resemblance: { type: 'string' },
          must_fix: { type: 'array', items: { type: 'string' }, description: 'at most 3, concrete, doable in one revision without adding variants' },
          notes: { type: 'string' },
        },
        required: ['key', 'strengths', 'weaknesses', 'owner_feedback_check', 'resemblance', 'must_fix', 'notes'],
      },
    },
    comparison: { type: 'string' },
    recommendation: { type: 'string' },
  },
  required: ['own_view_first', 'directions', 'comparison', 'recommendation'],
}

const CRITICS = [
  {
    key: 'form',
    lens: `你是資深角色設計師，做過多組成功的原創 LINE 貼圖角色與品牌吉祥物。這一輪你的評審標準主要就是業主的回饋（${R}/brief-r2.md）：
(1) 形體是否一眼就是一個好角色：頭、身、手、腳從剪影讀得出，像成功的角色那樣有清楚、討喜的輪廓。
(2) 有沒有任何形狀或顏色會讓人聯想到皮膚、人體部位或器官。業主第一輪就是因為這點否定了 A、B，所以請親自檢查：用 render.sh 把每個 character.svg 做成純黑剪影（例如在 HTML 裡套 CSS filter: brightness(0)），看 48px 與 200px，再上下顛倒、左右翻轉，誠實寫下看到什麼。
(3) 手舉起來是否讀得出，手的末端是否清楚（48px、96px 都要看）。
(4) 業主喜歡的部分有沒有保住：B 的色鉛筆沙沙筆觸與漸層（比對 ${S}/b/concept-v1.png），C 的剪紙貼紙感、原創、立體、可愛（比對 ${S}/c/concept.png）。c2 這個方向業主只要求修手，若它改動了其他業主喜歡的地方，要指出來。
(5) 原創性：具體指出像哪個既有角色、像在哪個特徵，不要客氣（特別留意皮卡丘、史迪奇、三麗鷗、Sonny Angel、Molang、角落生物，以及 ChatGPT 參考圖裡那些現實動物）。用 brief-r2.md「業主補充」的兩個測試檢查：遮住臉能不能用一句不含動物名稱的話描述它；和皮卡丘、史迪奇、大耳狗的剪影並排會不會被認錯。也檢查它有沒有用「分很開的黑橢圓眼＋ω 嘴＋圓紅腮紅」那套臉。
(6) 情感感染力與眼神；是否像通用 AI 吉祥物。`,
  },
  {
    key: 'production',
    lens: `你是同時懂品牌插畫與前端動態的設計工程師（SVG/CSS、Web Animations、Lottie、Rive）。你的視角：
(1) 放在共振首頁上是否成立：自己用 render.sh 把每個角色合成到首頁截圖（${S}/../ref/landing-desktop-light.png、landing-desktop-dark.png）上看日間與夜間，放在不搶標題的位置。
(2) 48px 縮圖與夜紙。
(3) 拆件：打開 character.svg 檢查 <g> 分層與關節點註解；手臂繞肩膀舉起、揮手、探頭、走路要動哪些部位，關節點是否放對（舉手時手臂會不會和身體錯開或露出破綻，可以自己改 transform 渲染一張舉手測試圖看）。
(4) 效能：動畫中的 feTurbulence／feDisplacementMap 很耗資源，評估把材質預先點陣化（日夜兩套 2× WebP）只動 transform／opacity 的可行性；檔案大小；prefers-reduced-motion。
(5) 每個方向的實作成本（插畫完稿、拆件、出場／停留／互動／離場四段動態的粗估人日）。`,
  },
]

phase('Critique')
const critiques = await parallel(CRITICS.map(c => () =>
  agent(`${SCOPE.replace('你只負責下面指定給你的工作。', '你只負責評審，不要修改任何角色檔案。')}\n\n${c.lens}\n\n先讀 ${S}/brief.md、${R}/brief-r2.md，看品牌截圖與三張 ChatGPT 參考圖（${R}/reference/）。\n第一步（在看提案之前）：用幾句話寫下你自己認為這個品牌的角色形體最需要做對的事（own_view_first）。\n第二步：逐一用 Read 看三張概念圖 PNG、讀 proposal.md、打開 character.svg 原始碼；你的檢查圖輸出到 ${R}/review/${c.key}-*.png（用 render.sh），不要寫到各方向的資料夾。\n三個方向：\n${listing}\n\n針對每個方向給出具體觀察：優點、弱點、是否回應了業主的回饋（owner_feedback_check）、與既有 IP 的相似度，以及「下一輪必修」（must_fix，至多 3 項，必須具體、能在一次修訂內完成、不能要求增加變體或延伸系列）。directions 的 key 欄位只填 b2、c2 或 bc。最後寫三個方向的比較，以及你的推薦與理由（最終選擇權在業主）。全部用繁體中文。`,
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

const findFor = (c, key, i) => {
  const ds = c.directions || []
  const norm = x => String(x.key).trim().toLowerCase()
  return ds.find(x => norm(x) === key) || ds.find(x => norm(x).startsWith(key)) || ds[i]
}

phase('Revise')
const revised = await parallel(ok.map((r, i) => () => {
  const notes = crit.map(c => {
    const d = findFor(c, r.key, DIRECTIONS.findIndex(x => x.key === r.key))
    if (!d) return ''
    return `【${c.critic === 'form' ? '形體與角色評審' : '品牌與製作評審'}】\n優點：${d.strengths.join('；')}\n弱點：${d.weaknesses.join('；')}\n對業主回饋的檢查：${d.owner_feedback_check}\n相似度：${d.resemblance}\n必修：\n${d.must_fix.map((m, j) => `  ${j + 1}. ${m}`).join('\n')}\n備註：${d.notes}`
  }).filter(Boolean).join('\n\n')
  if (!notes) return Promise.resolve({ ...r, changes: [], declined: ['no critique received'] })
  return agent(`${SCOPE}\n\n你負責修訂 ${r.title}「${r.name_zh}」這一個方向，只修這一輪。檔案都在 ${R}/${r.key}/。先讀 ${S}/brief.md 與 ${R}/brief-r2.md，看 concept.png、讀 proposal.md 與 character.svg 原始碼，再讀兩位評審的意見：\n\n${notes}\n\n規則：\n- 動手前先用 cp 把現在的版本備份成同資料夾的 concept-v1.png、concept-v1.svg、character-v1.svg、proposal-v1.md，之後不要再動這些備份。\n- 只處理「必修」項目（兩位評審合計），弱點中與必修重疊的一併處理；不要增加變體、不要畫新角色、不要做動畫。若某項必修你判斷不該做（例如兩位評審意見衝突，或會削弱業主喜歡的地方），可以不做，但要寫明理由。業主的回饋（brief-r2.md）優先於評審意見。\n- 保持這個方向自己的身分，不要把其他方向的特徵搬進來。\n- 保留 id 前綴「${r.key}-」與拆件結構；修改後重新渲染 character.png（800×800）與 concept.png（1600×1000），用 Read 親眼確認，至少再看一輪微調。用 xmllint --noout 檢查 character.svg 與 concept.svg。\n- 更新 proposal.md 使其與圖一致，文末加「修訂紀錄」一節，列出改了什麼、為什麼、哪些沒改與理由。\n${COMMON.replaceAll('{P}', r.key).split('流程（控制成本')[0]}\n完成後以結構化輸出回報（絕對路徑）。`,
    { label: `revise:${r.key}`, phase: 'Revise', schema: REVISE_SCHEMA })
    .then(v => v && { ...v, key: r.key, title: r.title })
}))

return { drawn: ok, critiques: crit, revised: revised.filter(Boolean) }
