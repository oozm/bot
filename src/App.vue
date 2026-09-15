<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BotTile from '@/components/BotTile.vue'
import Customizer from '@/components/Customizer.vue'
import BloubBot from '@/components/BloubBot.vue'
import ExportBar from '@/components/ExportBar.vue'
import CycleDialog from '@/components/CycleDialog.vue'
import GifDialog from '@/components/GifDialog.vue'
import Settings from '@/components/Settings.vue'
import SideRail, { type ViewId } from '@/components/SideRail.vue'
import Timeline from '@/components/Timeline.vue'
import { nomDeCycle, t } from '@/i18n'
import {
  copie,
  copieTexte,
  cycleVersGif,
  cycleVersMp4,
  svgAutonome,
  telecharge,
  versGifAnime,
  versPng,
  versSvgAnime,
} from '@/ui/capture'
import {
  ACTION_BY_ID,
  ANIM_IMAGES,
  ANIM_PAS,
  CYCLE_TAILLE,
  FOND_GIF_DEFAUT,
  FORMAT_CYCLE_DEFAUT,
  GIF_IMAGES,
  GIF_PAS,
  BLANC,
  Abandon,
  couleurDeFond,
  cycleImages,
  cyclePas,
  nomFichier,
  type ActionId,
  type EtatExport,
  type FondGif,
  type FormatCycle,
} from '@/ui/export'
import { HUMEURS } from '@/ui/gaze'
import { INTRO, INTRO_GAZE, POSE_AT, introDue } from '@/ui/intro'
import { ecris, lis, type NomStocke } from '@/ui/stockage'
import {
  blockAt,
  blocksWith,
  defaultCycle,
  makeBlock,
  parseCycles,
  totalDuration,
  type Cycle,
} from '@/bot/cycles'
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID } from '@/bot/expressions'
import {
  COLOR_BY_ID,
  DEFAULT_COLOR,
  DEFAULT_SHAPE,
  SHAPE_BY_ID,
} from '@/bot/skins'
import { POSES, SEQUENCE, STATES, type StateId } from '@/bot/states'

/**
 * 视图由 URL 驱动：`#etat=orbit&stop` 打开指定状态并暂停，`#planche` 显示图板。
 * 每次 `hashchange` 都重读，好让浏览器前进/后退真正生效。
 */
function readHash() {
  const params = new URLSearchParams(location.hash.slice(1))
  const asked = params.get('etat') as StateId | null
  // 从不信任 URL：状态必须真实存在
  const known = STATES.some((s) => s.id === asked)
  return {
    state: known ? asked! : 'idle',
    named: known,
    playing: !params.has('stop'),
    gallery: params.has('planche'),
    // `#arrivee`：不必离开站点就能重播入场。入场只在「到来」时播放，
    // 没有这条链接，同一会话里就看不到第二次。
    arrivee: params.has('arrivee'),
  }
}

const initial = readHash()
const gallery = ref(initial.gallery)

/* ----------------------------------------------------------------- 入场 */

/**
 * 站点入场。蒙太奇以及四种不播放的理由在 `@/ui/intro`；这里只读浏览器状态并接线。
 *
 * 「来到」站点是浏览器知道的，不是我们：`navigate` 覆盖输入 URL、点链接、新标签；
 * `reload` 和 `back_forward` 是回到已经打开过的页。因此不写存储——持久标记会让
 * 入场在第一次访问后永远消失，那不是需求。
 *
 * 回退到 `navigate` 是给不提供该条目的浏览器：存疑时播放，而不是永远什么都不给看。
 */
/**
 * 系统请求的「减少动态效果」，是持续跟随，不是只读一次。
 *
 * 设置会在会话中途改——本来就是这么用的：觉得晃眼才打开。`setup` 里读一次
 * `matches`，会忽略直到刷新才生效的变化。
 *
 * 它关掉的是装饰：盒过渡、设置页入场漩涡（人为选择，不是视频测出来的）。
 * 它不关内容：呼吸、目光漂移、眨眼就是 bot 本身；拿掉只剩死图，而不是更安静的运动。
 */
const calmeQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const calme = ref(calmeQuery.matches)
calmeQuery.addEventListener('change', (e) => (calme.value = e.matches))

// `getEntriesByType` 类型是通用 `PerformanceEntry`，没有 `type`：
// `type` 在导航条目上，所以要断言。
const [nav] = performance.getEntriesByType(
  'navigation',
) as PerformanceNavigationTiming[]
const navigation = nav?.type ?? 'navigate'

const intro = ref(
  // `#arrivee` 明确要求看入场：绕过触发规则，这就是它的全部意义——
  // 刷新后也要能看，否则一辈子只能看一次。
  initial.arrivee ||
    introDue({
      named: initial.named,
      gallery: initial.gallery,
      rechargement: navigation !== 'navigate',
      calme: calme.value,
    }),
)

/* ------------------------------------------------------------------ 蒙太奇 */

/**
 * 视频上测得的蒙太奇只是种子：第一次启动填列表，之后以用户的蒙太奇为准——
 * 包括对那条种子的修改。
 */
const restored = parseCycles(lis('cycles'))
const cycles = ref<Cycle[]>(restored.length ? restored : [defaultCycle()])

/**
 * `#etat=` 链接去哪找状态：当前蒙太奇里有就用，否则找别的。蒙太奇都可编辑，
 * 请求的状态可能已被全部删掉——那种链接就不生效。
 */
function locate(id: StateId) {
  const ordre = [
    cycle.value,
    ...cycles.value.filter((c) => c.id !== activeId.value),
  ]
  for (const c of ordre) {
    const index = c.blocks.findIndex((b) => b.state === id)
    if (index >= 0) return { id: c.id, index }
  }
  return null
}

/**
 * 形状、颜色、表情和序列在刷新后仍在：这是用户的头像，不是会话设置。
 * 加载时校验，未知 id 回落到默认。
 */
function stored(
  nom: NomStocke,
  fallback: string,
  exists: (v: string) => boolean,
) {
  const v = lis(nom)
  return v && exists(v) ? v : fallback
}

const activeId = ref(
  stored('cycle', cycles.value[0]!.id, (v) =>
    cycles.value.some((c) => c.id === v),
  ),
)
const block = ref(0)
const elapsed = ref(0)

const cycle = computed(
  () => cycles.value.find((c) => c.id === activeId.value) ?? cycles.value[0]!,
)

// 指向具体状态的链接，打开包含它的那条蒙太奇
if (initial.named) {
  const found = locate(initial.state)
  if (found) {
    activeId.value = found.id
    block.value = found.index
  }
}

// 状态是播放器的输出：由当前块指挥。先对齐这块，避免从未显示过的状态 morph 进来。
//
// 入场除外：无论用户蒙太奇是什么，都从静止开始。球体必须看起来已经是最终样子，
// 不要 morph。若用蒙太奇第一块，首帧就会取决于用户塞了什么——爆散或彗星会在
// 球体出现时朝它 morph。
const state = ref<StateId>(
  intro.value ? 'idle' : (cycle.value.blocks[block.value]?.state ?? 'idle'),
)

/**
 * 延迟写入：拉长卡片时每次鼠标移动都会替换序列，而 `localStorage` 是同步的——
 * 拖拽时每秒写六十次会白白卡住渲染。
 */
let pending: ReturnType<typeof setTimeout>
function enregistreCycles() {
  clearTimeout(pending)
  ecris('cycles', JSON.stringify(cycles.value))
}
watch(cycles, () => {
  clearTimeout(pending)
  pending = setTimeout(enregistreCycles, 250)
})
watch(activeId, (v) => ecris('cycle', v))

/*
 * 关闭时冲掉延迟写入，否则标签在 250 ms 内关掉会丢最后一次修改——拉长卡片再关，
 * 手势等于没发生。
 *
 * 用 `pagehide` 不用 `beforeunload`：移动端进往返缓存时标签从不「卸载」，只有前者会触发。
 */
window.addEventListener('pagehide', enregistreCycles)

/* -------------------------------------------------------------------- 视图 */

// 个性化是首页；除非 URL 指定了状态——那种链接明确指向播放器。
const view = ref<ViewId>(initial.named ? 'animations' : 'personnaliser')

/**
 * 预览：只留场景，没有侧栏、面板和蒙太奇。Esc 或按钮退出，按钮是屏幕上仅剩的控件。
 */
const preview = ref(false)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') preview.value = false
})

/**
 * 预览双向控制播放：进去就播，出来就停。
 *
 * 进去是因为只为看、屏幕上没有任何控件——落到静帧没意义。出来是因为要回来编辑：
 * 拉卡片时长时蒙太奇还在走，等于跟播放头较劲。
 *
 * 用 watcher 而不是在两处处理函数里各写一次：按钮和 Esc 都能退出，漏一处就会忘。
 */
watch(preview, (on) => {
  playing.value = on
})
// 与切视图同一条规则：个性化里不播序列，否则看不清形状。
// watcher 只在变化时跑，初始化也要套一遍。
const playing = ref(
  intro.value || (initial.playing && view.value === 'animations'),
)

/**
 * 我们刚写入、还在等对应 `hashchange` 的那段 hash。
 *
 * 没有它，播放器过不了蒙太奇里重复的状态：`location.replace` 会触发 `hashchange`，
 * 监听器当外来导航处理，`locate` 返回该状态的第一次出现。`idle` 出现两次时，
 * 到第二次会把播放头拽回第一次——序列转圈永远走不完。暂停写 `&stop` 也一样。
 *
 * 读一次就清掉：一次写入最多一个事件，不能长期忽略这段——浏览器后退到同一状态
 * 是真导航，必须算数。
 */
let ecritParNous = ''

// URL 可分享，所以跟随状态和播放。replace 不是 push：不要每个状态占一条历史。
watch([state, playing], ([id, on]) => {
  // URL 描述的是播放器。不在播放器里时，屏幕上的状态只是视图装饰——
  // 设置页开场的轨道——不该进可分享链接。写进去还会触发 `hashchange`，
  // 把播放头按用户蒙太奇的下标复位，而该视图播的是自己的：播放器卡在轨道上。
  if (view.value !== 'animations') return
  ecritParNous = `#etat=${id}${on ? '' : '&stop'}`
  location.replace(ecritParNous)
})

window.addEventListener('hashchange', () => {
  // 我们自己的写入不是导航：见 `ecritParNous`
  if (location.hash === ecritParNous) {
    ecritParNous = ''
    return
  }
  const next = readHash()
  /*
   * 入场演的是页面打开。热着重播要拆整套布景——收面板、倒带、重武装 CSS 入场。
   * 刷新才能和访客看到的一模一样。只改 hash 不会刷新，所以要这个分支：
   * 没有它，敲 `#arrivee` 什么都不发生。
   */
  if (next.arrivee && !initial.arrivee) {
    location.reload()
    return
  }
  gallery.value = next.gallery
  if (next.gallery) return
  // 只有点名状态的链接才移动播放。没有这道闸，从图板回来（`#planche` 再 `#`）
  // 会跳到蒙太奇开头。
  if (!next.named) return
  const found = locate(next.state)
  if (!found) return
  // 点名状态的链接对准播放器：即使从别的视图也切过去
  view.value = 'animations'
  activeId.value = found.id
  block.value = found.index
})

/**
 * 离开播放器就不看序列：回到静止并停下衔接。时钟照走——目光仍漂移、眼仍眨，
 * bot 还活着，又不妨碍判断形状；设置页里目光也能跟着指针。
 */
/*
 * 播放器打开时是停着的：切到这个标签不是在要求播蒙太奇——那是播放按钮的事。
 * 之后 `resume` 接手，再回来时播放状态还是离开时那样。
 *
 * 唯一例外是点名状态的链接（`#etat=`）：对准播放器，并且已经描述了播放，
 * `&stop` 正是暂停打开的写法。所以用 `initial.named`，不是单看 `initial.playing`。
 *
 * 预览总是开播（`enterPreview`）：进去只为看，屏幕上没有任何开播控件。
 */
let resume = initial.named && initial.playing
let resumeBlock = block.value

/**
 * 离开播放器时，播的是单独一块静止：用户序列完全可以没有静止，而只有静止能看见所选形状（`baseBody`）。
 */
const REST = [makeBlock('idle')]

/**
 * 进入设置：先漩涡，再静止。
 *
 * `swirl` 带着静止脸，所以第一帧就能跟指针，眼睛转一整圈落到左边（见 `src/ui/gaze.ts`）。
 * 后面的静止块姿势完全一样：衔接看不见。
 */
const ENTREE = [makeBlock('swirl'), makeBlock('idle')]
/**
 * 「减少动态效果」时入场直达静止：漩涡是界面过渡，人为选的、不是测的，对该设置算装饰。
 */
const ENTREE_CALME = [makeBlock('idle')]

const played = computed(() => {
  if (intro.value) return INTRO
  if (view.value === 'animations') return cycle.value.blocks
  if (view.value !== 'reglages') return REST
  return calme.value ? ENTREE_CALME : ENTREE
})

watch(view, (now, before) => {
  // 切视图就打断入场：它只在首页有意义，把球放到位。
  // 这两秒内只有跟上 `#etat=` 能进来，那时由链接指挥。
  intro.value = false
  // 只在离开播放器时记住位置：从个性化进设置不该用刚写进去的 0 盖掉已保存的位置。
  if (before === 'animations') {
    resume = playing.value
    resumeBlock = block.value
  }
  if (now === 'animations') {
    playing.value = resume
    block.value = resumeBlock
    return
  }
  block.value = 0
  // 离开播放器时只有设置页还在播：它的入场轨道
  playing.value = now === 'reglages'
})

/**
 * 入场只播一次：播放器到静止块就切断衔接。否则蒙太奇循环，视图会无限重播入场。
 *
 * 站点入场时，最后一块只是交还控制权：布景早就摆好了（见下面的 `nue`）。
 * 同时播的蒙太奇变回该视图的——播放器对齐到唯一静止块，已经在那儿，`setState`
 * 忽略未变状态，看不见跳变；眨眼到静止的淡化继续。
 */
watch(block, (i) => {
  if (intro.value) {
    if (i >= INTRO.length - 1) {
      intro.value = false
      playing.value = false
    }
    return
  }
  if (view.value === 'reglages' && i > 0) playing.value = false
})

/**
 * 球是否还独自在场？
 *
 * 不是第二面要维护的旗：播放器位置说了算。还在第一块时球单独出现；进入眨眼，
 * 界面就在。也就是这块的入场眨眼触发布景，并把它盖住——眼睛闭着时页面在动，
 * 目光接到眨眼姿势。把布景挪到蒙太奇末尾，三个动作会同时、毫无遮挡地发生。
 *
 * 蒙太奇在这个拐点之后继续：`intro` 保持到最后一块，否则 `played` 会在播放器
 * 底下换掉，眨眼刚开始就被切断。
 */
const nue = computed(() => intro.value && block.value < POSE_AT)

/**
 * 哪块面板开着。同一时刻只有一列有宽度；球独自在场时两列都没有：
 * 把宽度还给右栏，球才滑到自己的位置。
 */
const gauche = computed(() => !nue.value && view.value === 'reglages')
const droite = computed(() => !nue.value && view.value !== 'reglages')

/* ------------------------------------------------------------------- 皮肤 */

const shape = ref(stored('forme', DEFAULT_SHAPE, (v) => SHAPE_BY_ID.has(v)))
const color = ref(stored('couleur', DEFAULT_COLOR, (v) => COLOR_BY_ID.has(v)))
const expression = ref(
  stored('expression', DEFAULT_EXPRESSION, (v) => EXPRESSION_BY_ID.has(v)),
)

watch(shape, (v) => ecris('forme', v))
watch(color, (v) => ecris('couleur', v))
watch(expression, (v) => ecris('expression', v))

/**
 * 产品名，页脚字标。不翻译——是品牌。正文写「xBot」，三语的 `app.name` /
 * `app.title` 用同一形式。
 */
const NOM = 'xBot'

/* ----------------------------------------------------------------- 情绪 */

/**
 * 设置页里，眼睛跟指针时 bot 偶尔换情绪。这是页面上的一层漆，不是设置：
 * 不替换、不写入用户选的表情，只在这次访问里播另一种。
 *
 * 选哪些情绪不是口味问题：见 `src/ui/gaze.ts` 里的 `HUMEURS`。
 */

/**
 * 转一圈时球变回圆，不管选了什么形状——设置页和站点入场都是。不改用户选择，
 * 只改眼前显示：之后原样回来，并且是 morph 回来，让形状回归成为场面的一段时间，
 * 而不是硬切。
 *
 * 两条理由，第二条是测出来的：
 *
 * - morph 出来的水滴或六边形看不出在转的球，视频里是球体；
 * - 更要紧：眼睛贴在真实轮廓上（`radiusAtAngle`）才不溢出剪影。圆上半径恒定，
 *   转一圈是平滑的；水滴上眼睛随剖面上下走——相对圆轨迹垂直差到 25 px。
 *   看起来在跳，别处修不了：`radiusAtAngle` 就是干这个的。
 */
const forme = computed(() =>
  view.value === 'reglages' || nue.value ? DEFAULT_SHAPE : shape.value,
)

/** 一种情绪的时长。够久能注意到，又不至于晃。 */
const HUMEUR_MS = 4200

const humeur = ref<string | null>(null)
let humeurTimer: ReturnType<typeof setInterval> | undefined

watch(view, (v) => {
  clearInterval(humeurTimer)
  if (v !== 'reglages') {
    // 回到用户表情，和其他东西一样 morph
    humeur.value = null
    return
  }
  // 从用户自己的表情出发再漂移：变化才看得出来
  let i = 0
  humeurTimer = setInterval(() => {
    humeur.value = HUMEURS[i % HUMEURS.length]!
    i++
  }, HUMEUR_MS)
})

const order = computed(() =>
  SEQUENCE.map((id) => STATES.find((s) => s.id === id)!),
)

/** 在当前蒙太奇末尾加一段动画。 */
function addBlock(id: StateId) {
  cycles.value = cycles.value.map((c) =>
    c.id === cycle.value.id ? { ...c, blocks: blocksWith(c.blocks, id) } : c,
  )
}

/**
 * 从时间尺拖播放头。只有播放器能把引擎对上（它握着时钟），所以直接调。
 */
const bot = ref<InstanceType<typeof BloubBot> | null>(null)

function onSeek(t: number) {
  const { index, elapsed: offset } = blockAt(cycle.value.blocks, t)
  bot.value?.seek(index, offset)
}

/* ------------------------------------------------------------------ 导出 */

/**
 * 入场结束后导出栏再出现的延迟：等头像落到位置。
 *
 * 这是它唯一会动的时候。切视图不会让它「出现」：它像蒙太奇栏一样贴在窗口上
 *（见 styles.css 的 `.barre-export`），生来就在位——不位移的东西不必宣布自己。
 */
const RETARD_ARRIVEE = 400

/**
 * 场景对齐前先藏栏。初始化时是可见的：刷新或直接进这里，什么都不该动——和面板同一条规则。
 */
const barreCachee = ref(false)
let minuteurBarre: ReturnType<typeof setTimeout> | undefined

/* 入场结束：球不再独自在场。 */
watch(nue, (encore, avant) => {
  if (!avant || encore) return
  barreCachee.value = true
  clearTimeout(minuteurBarre)
  minuteurBarre = setTimeout(() => (barreCachee.value = false), RETARD_ARRIVEE)
})

/* --------------------------------------------------- 导出蒙太奇 */

const dialogueCycle = ref(false)
const formatCycle = ref<FormatCycle>(FORMAT_CYCLE_DEFAUT)
const fondCycle = ref<FondGif>(FOND_GIF_DEFAUT)
/** `null` 表示没在编码；否则是已完成比例，给进度条。 */
const avancementCycle = ref<number | null>(null)
/**
 * 最近一次蒙太奇导出是否失败？
 *
 * 单独状态，不用 `etatExport`：那个管 `ExportBar`，只在个性化视图里渲染，
 * 而这盒子在动画视图。失败会写进屏幕上不存在的组件——进度条消失，盒子还开着，不知道为什么。
 */
const erreurCycle = ref(false)
/** 用来中止正在进行的编码。 */
let abandonCycle: AbortController | null = null

/**
 * 导出的是蒙太奇，不是头像：当前序列在屏外从头播到尾。一条序列几十秒，
 * 盒子保持打开并显示进度，而不是让页面冻住。
 */
async function exporteCycle() {
  if (avancementCycle.value !== null) return
  erreurCycle.value = false
  const controle = new AbortController()
  abandonCycle = controle
  const blocs = cycle.value.blocks
  const format = formatCycle.value
  const images = cycleImages(totalDuration(blocs), format)
  const pas = cyclePas(format)
  const taille = CYCLE_TAILLE[format]
  const reglages = {
    shape: shape.value,
    color: color.value,
    expression: expression.value,
  }
  const suit = (fait: number, total: number) =>
    (avancementCycle.value = fait / total)

  avancementCycle.value = 0
  try {
    const mp4 = format === 'mp4'
    // 视频没有 alpha：必须铺白。GIF 仍可自选。
    const fichier = mp4
      ? await cycleVersMp4(
          reglages,
          blocs,
          taille,
          images,
          pas,
          BLANC,
          suit,
          controle.signal,
        )
      : await cycleVersGif(
          reglages,
          blocs,
          taille,
          images,
          pas,
          couleurDeFond(fondCycle.value),
          suit,
          controle.signal,
        )
    telecharge(
      fichier,
      nomFichier(nomDeCycle(cycle.value), '', '', mp4 ? 'mp4' : 'gif'),
    )
    dialogueCycle.value = false
  } catch (e) {
    // 放弃不是失败：不要告诉别人他已经得到了自己要的东西。
    if (!(e instanceof Abandon)) erreurCycle.value = true
  } finally {
    avancementCycle.value = null
    abandonCycle = null
  }
}

/** 从盒子请求中止：Esc，或它的按钮。 */
function annuleCycle() {
  abandonCycle?.abort()
}

/*
 * 失败属于这次尝试，不属于盒子：再打开必须是新的。
 * 不清理的话，旧失败会在下次打开时还在，「重试」还没开始就被提示。
 */
watch(dialogueCycle, (ouverte) => {
  if (ouverte) erreurCycle.value = false
})

/** 导出确认显示多久。 */
const CONFIRMATION_MS = 1800

const etatExport = ref<EtatExport>('pret')
let confirmation: ReturnType<typeof setTimeout> | undefined

/**
 * GIF 背景，以及询问它的盒子。只有 GIF 要问：只有它是一位透明度，硬边需要拍板。
 */
const fondGif = ref<FondGif>(FOND_GIF_DEFAUT)
const dialogueGif = ref(false)

/**
 * 导出屏幕上看到的头像：`ExportBar` 只点格式，要抓的 SVG 在这里，蒙太奇和皮肤也是。
 *
 * 用户看见的就是得到的，差在裁切——序列化的是活节点，不是旁边另画一份。
 */
async function exporte(id: ActionId, confirme = false) {
  // 同步闸，外加按钮 `disabled`：后者要等一次渲染，同一帧点两次会下两份。
  if (etatExport.value === 'occupe') return

  // GIF 先问背景，盒子用 `confirme` 再调回来。看盒子开着与否不行：它在发出事件前
  // 就关上，会当成关着又无限重开。
  if (!confirme && ACTION_BY_ID.get(id)?.mode === 'gif') {
    dialogueGif.value = true
    return
  }
  const action = ACTION_BY_ID.get(id)
  const svg = bot.value?.$el as SVGSVGElement | null | undefined
  if (!action || !svg) return

  clearTimeout(confirmation)
  etatExport.value = 'occupe'
  const nom = () =>
    nomFichier(
      shape.value,
      expression.value,
      color.value,
      action.extension,
      action.suffixe,
    )
  try {
    if (action.mode === 'anime') {
      // 动画不从屏幕上的 SVG 出发：从头在屏外实例上重播。见 `sequenceDuBot`。
      const reglages = {
        shape: shape.value,
        color: color.value,
        expression: expression.value,
      }
      telecharge(
        await versSvgAnime(reglages, action.taille, ANIM_IMAGES, ANIM_PAS),
        nom(),
      )
      etatExport.value = 'exporte'
    } else if (action.mode === 'gif') {
      const reglages = {
        shape: shape.value,
        color: color.value,
        expression: expression.value,
      }
      const fond = couleurDeFond(fondGif.value)
      telecharge(
        await versGifAnime(reglages, action.taille, GIF_IMAGES, GIF_PAS, fond),
        nom(),
      )
      etatExport.value = 'exporte'
    } else {
      const markup = svgAutonome(svg, action.taille)
      if (action.mode === 'copieImage') {
        // blob 以 Promise 交出，这里不等：见 capture.ts 的 `copie`。
        await copie(versPng(markup, action.taille))
        etatExport.value = 'copie'
      } else if (action.mode === 'copieTexte') {
        await copieTexte(markup)
        etatExport.value = 'copie'
      } else {
        const fichier =
          action.extension === 'svg'
            ? new Blob([markup], { type: 'image/svg+xml' })
            : await versPng(markup, action.taille)
        telecharge(fichier, nom())
        etatExport.value = 'exporte'
      }
    }
  } catch {
    // 剪贴板拒绝或编码失败，不能让栏卡在「占用」。
    etatExport.value = 'erreur'
  }
  confirmation = setTimeout(() => (etatExport.value = 'pret'), CONFIRMATION_MS)
}

/**
 * 每次进入设置都重播入场。
 *
 * 不对齐的话，播放器会沿用上一视图的块起点和 `elapsed`：漩涡块一出生就过期，
 * 入场被一帧吃掉——只看见淡化结尾，像失误而不是场面。只要光标已经在块 0，
 * 光写 `block.value = 0` 不变、watcher 不跑，就会发生。
 *
 * `flush: 'post'`：组件先接到新蒙太奇，再请它对齐。
 */
watch(
  view,
  (v) => {
    if (v === 'reglages') bot.value?.seek(0, 0)
  },
  { flush: 'post' },
)
</script>

<template>
  <div v-if="gallery" class="p-5">
    <a
      class="text-xs text-[var(--muted)] underline underline-offset-2"
      href="#"
    >
      {{ t('gallery.back') }}
    </a>
    <div
      class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3"
    >
      <figure v-for="s in order" :key="s.id" class="flex flex-col items-center">
        <BloubBot
          :state="s.id"
          :size="210"
          :shape="shape"
          :color="color"
          :expression="expression"
          :frozen-at="POSES[s.id]"
        />
        <figcaption class="text-xs text-[var(--muted)]">
          {{ t(`states.${s.id}`) }}
        </figcaption>
      </figure>
    </div>
  </div>

  <template v-else>
    <!-- 结构标题：页面故意不显示标题，但没有 h1 的文档读屏无法导航 -->
    <h1 class="sr-only">{{ t('app.name') }}</h1>
    <!-- 入场期间栏仍挂着——它是 `fixed`，卸掉腾不出地方——但擦掉且无交互：
         否则看不见还会进 Tab 序。`|| undefined` 因为浏览器把 `inert="false"` 当真。 -->
    <SideRail
      v-if="!preview"
      v-model="view"
      class="rail"
      :inert="nue || undefined"
    />

    <!-- 退出预览：和头像一起留在屏幕上的唯一元素。 -->
    <button
      v-else
      type="button"
      class="fixed top-5 right-5 z-30 flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs text-[var(--muted)] shadow-sm backdrop-blur transition hover:text-[var(--ink)]"
      @click="preview = false"
    >
      {{ t('preview.exit') }}
      <kbd class="rounded bg-black/5 px-1 py-0.5 text-[10px]">
        {{ t('preview.key') }}
      </kbd>
    </button>

    <!-- 蒙太奇栏的占位只在它存在的地方留。所有视图都留的话，右栏会少掉
         掉 236 px 高度，换成什么都不填的空白：个性化网格会在三分之一白屏下滚动。
         占位另外保住的——头像和设置面板，标签间不能重新居中——改由这两列自己承担，
         同一条带高度（`100dvh - 3rem - var(--timeline)`）。 -->
    <!-- `max-lg:px-5`：375 px 宽的窗口里 2rem 侧边距，是六分之一宽度白扔。
         底 padding 这里不动：动画视图会换成蒙太奇栏占位，再写 `max-lg:pb-*` 会抢过去。 -->
    <div
      class="scene min-h-full items-stretch justify-center p-8 max-lg:flex max-lg:flex-col max-lg:gap-10 max-lg:px-5"
      :class="[
        !preview &&
          view === 'animations' &&
          'pb-[calc(var(--timeline)_+_1rem)]',
        // 低于 64rem 时轨变成顶栏（见 `SideRail`），像当初浮在左边一样浮着：
        // 场景必须给它留高度，否则堆叠第一个元素会钻到底下。预览除外，
        // 那是唯一卸掉轨的情况——还留位置会白白把头像往下推 80 px。
        !preview && 'max-lg:pt-20',
        nue || preview
          ? 'scene--seule'
          : view === 'reglages' && 'scene--gauche',
      ]"
    >
      <!--
        设置面板，左列：开这一列才把头像推向右边。切视图仍挂着，否则没有可滑的东西——
        是列宽把它收起来，不是 `v-if`。
      -->
      <!-- 垂直居中，和右栏相反：那边是从顶往下的长缩略图网格，这边只有几行，
           贴在大片空白顶部会像被忘掉。再往上挪一档：像素居中会落到视线以下，
           视线在上三分之一。

           相对头像条带居中（和 `main` 同一高度），不是相对整列：这视图没有蒙太奇栏，
           列一直到窗口底，相对列居中会按标签把面板再往下送一百来像素。 -->
      <!-- `lg:pl-14`：轨浮在场景上，场景不再给它留位——否则会把头像往右挤。
           只有这块内容够靠左会钻到轨底下，所以是它让开，不是整场场景。 -->
      <aside
        v-if="!preview"
        class="panneau scene__gauche w-full lg:flex lg:h-[calc(100dvh_-_3rem_-_var(--timeline))] lg:w-80 lg:shrink-0 lg:flex-col lg:justify-center lg:self-start lg:-translate-y-12 lg:pl-14"
        :class="gauche ? 'panneau--ouvert max-lg:order-2' : 'max-lg:hidden'"
      >
        <Settings />
      </aside>

      <!-- 场景。高度不能跟右栏走：`items-stretch` 时会跟着个性化面板，
           它比动画网格高，居中的头像会在标签间换位置。 -->
      <main
        class="scene__avatar relative flex flex-1 items-center justify-center max-lg:order-1 max-lg:flex-col max-lg:gap-4 lg:self-start"
        :class="
          preview
            ? 'lg:min-h-[calc(100dvh_-_4rem)]'
            : 'lg:min-h-[calc(100dvh_-_3rem_-_var(--timeline))]'
        "
      >
        <!-- 头像跟着可用高度：矮窗口里蒙太奇栏占掉不少，460 的方块会溢出并让页面滚动 -->
        <div
          class="avatar flex aspect-square w-full items-center justify-center"
          :class="[
            preview
              ? 'max-w-[min(560px,calc(100dvh_-_6rem))]'
              : 'max-w-[min(460px,calc(100dvh_-_var(--timeline)_-_7rem))]',
            nue && 'avatar--intro',
            view === 'reglages' && !preview && 'avatar--geant',
          ]"
        >
          <BloubBot
            ref="bot"
            class="h-auto max-w-full"
            v-model:state="state"
            v-model:block="block"
            v-model:elapsed="elapsed"
            v-model:playing="playing"
            :cycle="played"
            :size="preview ? 560 : 440"
            :shape="forme"
            :color="color"
            :expression="humeur ?? expression"
            :follow="view === 'reglages'"
            :gaze="intro ? INTRO_GAZE : null"
          />
        </div>

        <!--
          导出栏不挤头像：它在流外，`--timeline` 已从这列高度里减掉（两个视图都减，
          否则切到个性化时居中头像会换位），球下面那条带已经空着。不用再留、不用加变量。

          和蒙太奇栏一样 `fixed`，但贴头像列（`left`/`right`），不是整窗：
          内容在球下方居中，不是屏幕正中。

          细定位在 `styles.css`（`.barre-export`），要用头像盒子的 `min()`。
          低于 64rem 那条规则不生效：场景堆叠、不留位，栏回到文档流——否则会盖住个性化。
        -->
        <!--
          入场时挂着但藏着（`nue`），不是卸掉：那是过渡的起始状态，屏幕上没有它
          就没有可插值的。和 `.panneau` 同一套挂载。

          遮罩时加 `inert`：`opacity: 0` 的元素仍可点、仍可键盘到达。
        -->
        <div
          v-if="view === 'personnaliser' && !preview"
          class="barre-export"
          :class="(nue || barreCachee) && 'barre-export--cachee'"
          :inert="nue || barreCachee"
        >
          <ExportBar :etat="etatExport" @exporter="exporte" />
        </div>

        <!--
          两个盒子在导出栏外面，尽管是栏打开第二个：栏被藏时带着 `inert`，
          `inert` 作用到整棵子孙——包括进了上层的元素，那不该被掐掉。

          从蒙太奇栏导出蒙太奇：格式和进度。
        -->
        <CycleDialog
          v-if="view === 'animations' && !preview"
          v-model:open="dialogueCycle"
          v-model:format="formatCycle"
          v-model:fond="fondCycle"
          :avancement="avancementCycle"
          :erreur="erreurCycle"
          @confirm="exporteCycle"
          @annuler="annuleCycle"
        />

        <!-- 导出头像：只有 GIF 要问背景，见 `exporte`。 -->
        <GifDialog
          v-if="view === 'personnaliser' && !preview"
          v-model:open="dialogueGif"
          v-model:fond="fondGif"
          @confirm="exporte('gif', true)"
        />
      </main>

      <!-- 两视图固定同一宽度：否则切标签场景会挪。w-80 是个性化约束
           （4 列缩略图），动画面板去适应。 -->
      <aside
        v-if="!preview"
        class="panneau scene__droite w-full lg:w-80 lg:shrink-0"
        :class="droite ? 'panneau--ouvert max-lg:order-2' : 'max-lg:hidden'"
      >
        <!-- 调色板：点缩略图加到蒙太奇末尾 -->
        <template v-if="view === 'animations'">
          <h2 class="text-sm font-semibold">{{ t('panel.animations') }}</h2>
          <div class="mt-2 grid grid-cols-4 gap-1.5">
            <BotTile
              v-for="s in order"
              :key="s.id"
              :label="t(`states.${s.id}`)"
              :selected="s.id === state"
              :state="s.id"
              :shape="shape"
              :color="color"
              :expression="expression"
              :frozen-at="POSES[s.id]"
              @click="addBlock(s.id)"
            />
          </div>
        </template>

        <!-- 个性化 -->
        <template v-else>
          <Customizer
            v-model:shape="shape"
            v-model:color="color"
            v-model:expression="expression"
          />
        </template>
      </aside>
    </div>

    <p
      v-if="view === 'reglages' && !preview"
      class="wordmark"
      aria-hidden="true"
    >
      {{ NOM }}
    </p>

    <Timeline
      v-if="view === 'animations' && !preview"
      v-model:cycles="cycles"
      v-model:active-id="activeId"
      v-model:block="block"
      v-model:playing="playing"
      :elapsed="elapsed"
      :shape="shape"
      :color="color"
      :expression="expression"
      @seek="onSeek"
      @preview="preview = true"
      @exporter="dialogueCycle = true"
    />
  </template>
</template>
