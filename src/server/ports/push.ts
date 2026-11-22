/**
 * Pushes to phones, in our own words (no FCM `MulticastMessage`): the
 * gateway turns a PushMessage into whatever its service takes — FCM's
 * `android` / `apns` blocks today (infra/fcm, the push lane), APNs directly
 * later. The fields are what src/lib/push/{send,chat,picks,tapBell,
 * connectionCards}.ts set today; the push lane may add one a call site needs.
 */
export interface PushMessage {
  /**
   * What the system shows. Left out, the push is data-only: an app that
   * draws its own notification (Android's chat push) gets only `data`.
   */
  title?: string;
  body?: string;
  /** Handed to the app as is (every value a string, as FCM requires). */
  data: Record<string, string>;
  /** Android notification channel (`activity`, `messages`, `picks`…). */
  channel?: string;
  /** Android notification tag: a later push with the same tag replaces this one. */
  tag?: string;
  /** `apns-collapse-id`: a later push with the same id replaces this one on iOS. */
  collapseId?: string;
  /** iOS `thread-id`: notifications grouped together. */
  threadId?: string;
  /** Delivery priority (FCM's Android `priority`). */
  priority?: 'high' | 'normal';
  /** `apns-priority`: 5 delivers when convenient (an unsend's quiet replacement), 10 at once. */
  applePriority?: 5 | 10;
  /** How prominently Android shows it (the notification's own priority). */
  display?: 'min' | 'low' | 'default' | 'high';
  /** No sound: no `aps.sound`, Android's `defaultSound: false`. */
  silent?: boolean;
  /** iOS interruption level (`passive` never lights the screen). */
  interruptionLevel?: 'passive' | 'active' | 'time-sensitive';
  badge?: number;
  /**
   * iOS `mutable-content`: the app's notification service extension may redraw it before it shows
   * (a chat message under its sender's face). A build without the extension shows it as sent.
   */
  mutable?: boolean;
  /** A picture shown with it (absolute https URL). */
  image?: string;
}

export interface PushOutcome {
  /** How many installs the service took it for. */
  sent: number;
  /** Tokens the service will never deliver to again (uninstalled, rotated): forget their devices. */
  dead: string[];
}

export interface PushGateway {
  /**
   * Send one message to these installs (any number: the gateway splits them
   * into the service's batches). Throws when the service could not be asked
   * at all; a token it refused is in `dead` or simply not counted.
   */
  send(tokens: string[], message: PushMessage): Promise<PushOutcome>;
}
