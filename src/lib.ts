import XBot from './components/BloubBot.vue'

export { XBot, XBot as default }

export {
  COLORS,
  SHAPES,
  COLOR_BY_ID,
  SHAPE_BY_ID,
  DEFAULT_COLOR,
  DEFAULT_SHAPE,
  mixHex,
  resolveColor,
  type BotColor,
  type BotShape,
  type ColorId,
  type ShapeId,
} from './bot/skins'

export {
  EXPRESSIONS,
  EXPRESSION_BY_ID,
  DEFAULT_EXPRESSION,
  type BotExpression,
  type ExpressionId,
} from './bot/expressions'

export { type StateId } from './bot/states'
export { type Block } from './bot/cycles'
export type { GazeScript } from './ui/gaze'
