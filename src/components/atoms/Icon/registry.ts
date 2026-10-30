import { BellIcon } from './icons/bell';
import { StarIcon } from './icons/star';
import { SparkleIcon } from './icons/sparkle';
import { CloseIcon } from './icons/close';
import { PlusIcon } from './icons/plus';
import { CheckIcon } from './icons/check';
import { ArrowRightIcon } from './icons/arrow-right';
import { ChevronDownIcon } from './icons/chevron-down';
import { ImageIcon } from './icons/image';
import { EyeIcon } from './icons/eye';
import { LockIcon } from './icons/lock';
import { UsersIcon } from './icons/users';
import { GlobeIcon } from './icons/globe';
import { WaveIcon } from './icons/wave';
import { PenIcon } from './icons/pen';
import { CardsIcon } from './icons/cards';
import { LogoutIcon } from './icons/logout';
import { DotsIcon } from './icons/dots';
import { TrashIcon } from './icons/trash';
import { MinusIcon } from './icons/minus';
import { FrameIcon } from './icons/frame';
import { NoteIcon } from './icons/note';
import { BookmarkIcon } from './icons/bookmark';
import { ChatIcon } from './icons/chat';
import { ChatFillIcon } from './icons/chat-fill';
import { SparkleFillIcon } from './icons/sparkle-fill';
import { BellFillIcon } from './icons/bell-fill';
import { CardsFillIcon } from './icons/cards-fill';
import { UserCheckIcon } from './icons/user-check';
import { SearchIcon } from './icons/search';
import { UserIcon } from './icons/user';
import { KeyIcon } from './icons/key';
import { PaletteIcon } from './icons/palette';
import { DocumentIcon } from './icons/document';
import { ArrowsHorizontalIcon } from './icons/arrows-horizontal';
import { FlagIcon } from './icons/flag';
import { BanIcon } from './icons/ban';
import { ShareIcon } from './icons/share';
import { SlidersIcon } from './icons/sliders';
import { SendIcon } from './icons/send';
import { ReplyIcon } from './icons/reply';
import { RestoreIcon } from './icons/restore';
import { CopyIcon } from './icons/copy';
import { LinkIcon } from './icons/link';
import { CollapseRightIcon } from './icons/collapse-right';
import { ArrowUpIcon } from './icons/arrow-up';
import { MaskIcon } from './icons/mask';
import { SmileIcon } from './icons/smile';
import { KeyboardIcon } from './icons/keyboard';
import { ExpandIcon } from './icons/expand';
import { CollapseIcon } from './icons/collapse';
import { ClockIcon } from './icons/clock';
import type { IconRenderer } from './types';

/**
 * Central icon registry. Add a new icon by:
 *  1) Creating `./icons/<name>.tsx` that exports a renderer using IconRenderProps.
 *  2) Importing and adding it to the map below.
 *  3) Adding the string literal to `IconName` so consumers get type safety.
 *
 * Why a registry (vs. importing each component directly):
 *  - Single source of truth — easy to audit, easy to swap implementations.
 *  - Consumers spell icon names as strings, which makes prop drilling
 *    (e.g. <FloatingButton icon="plus" />) trivial without forcing every
 *    parent to import the underlying component.
 *  - All icons share the same prop contract (size / color / strokeWidth),
 *    which keeps the hand-drawn style consistent across the app.
 */
export const ICONS = {
  bell: BellIcon,
  star: StarIcon,
  sparkle: SparkleIcon,
  close: CloseIcon,
  plus: PlusIcon,
  check: CheckIcon,
  'arrow-right': ArrowRightIcon,
  'chevron-down': ChevronDownIcon,
  image: ImageIcon,
  eye: EyeIcon,
  lock: LockIcon,
  users: UsersIcon,
  globe: GlobeIcon,
  wave: WaveIcon,
  pen: PenIcon,
  cards: CardsIcon,
  logout: LogoutIcon,
  dots: DotsIcon,
  trash: TrashIcon,
  minus: MinusIcon,
  frame: FrameIcon,
  note: NoteIcon,
  bookmark: BookmarkIcon,
  chat: ChatIcon,
  // The selected tabs' solid twins (round 16 §2): the outline filled, its details knocked out.
  'chat-fill': ChatFillIcon,
  'sparkle-fill': SparkleFillIcon,
  'bell-fill': BellFillIcon,
  'cards-fill': CardsFillIcon,
  'user-check': UserCheckIcon,
  search: SearchIcon,
  user: UserIcon,
  key: KeyIcon,
  palette: PaletteIcon,
  document: DocumentIcon,
  'arrows-horizontal': ArrowsHorizontalIcon,
  flag: FlagIcon,
  ban: BanIcon,
  share: ShareIcon,
  sliders: SlidersIcon,
  send: SendIcon,
  reply: ReplyIcon,
  restore: RestoreIcon,
  copy: CopyIcon,
  link: LinkIcon,
  'collapse-right': CollapseRightIcon,
  'arrow-up': ArrowUpIcon,
  mask: MaskIcon,
  // A message's hover tool that opens its reactions (round 16 §3).
  smile: SmileIcon,
  // The composer's (round 22): back to the keyboard from the stickers, the field grown and shrunk, recent stickers.
  keyboard: KeyboardIcon,
  expand: ExpandIcon,
  collapse: CollapseIcon,
  clock: ClockIcon,
} satisfies Record<string, IconRenderer>;

export type IconName = keyof typeof ICONS;
