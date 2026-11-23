package com.resonance.app

import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.resonance.kit.chat.ChatPush
import com.resonance.kit.chat.ChatUnsend
import com.resonance.kit.push.PushPlacement

/**
 * FCM's side of push (the twin of iOS's AppDelegate callbacks). A push that arrives while the app
 * is closed is shown by the system itself, from the message's `notification` and the channel it
 * names ("activity", or "picks" for the pushes the person turned on); one that arrives while it is
 * open comes here, where the app posts the same notification in the same channel ([PushPlacement]).
 *
 * A chat message is different: this build tells the server it draws those itself (`chat-push`),
 * so they arrive as data-only pushes — in every state of the app — and become the conversation's
 * notification here ([PushCenter.showChatMessage]). A message that came with a notification
 * payload all the same (an older path) takes the same road when the app is open.
 */
class ResonancePushService : FirebaseMessagingService() {
    @Suppress("OVERRIDE_DEPRECATION") // the registration-token callback; onRegistered belongs to the manifest opt-in
    override fun onNewToken(token: String) = PushCenter.tokenChanged(token)

    override fun onMessageReceived(message: RemoteMessage) {
        val kind = PushArrival.of(message.data, message.notification?.title)
        // Before anything returns: a chat message is opened from its notification as often as a pick.
        if (kind.warmsTokens) warmTokens()
        when (kind) {
            PushArrival.Chat -> {
                // Only for the account signed in now. A push can wake a process the app never started, where
                // AppFirebase isn't set up yet: the default app (FCM's own) holds the same persisted sign-in.
                val me = runCatching { FirebaseAuth.getInstance().currentUser?.uid }.getOrNull()
                ChatPush.from(message.data, message.notification?.title, message.notification?.body)
                    ?.takeIf { it.isFor(me) }
                    ?.let { PushCenter.showChatMessage(this, it) }
            }
            PushArrival.Unsend -> {
                // A message taken back: its line leaves the conversation's notification (round 16 §3).
                val me = runCatching { FirebaseAuth.getInstance().currentUser?.uid }.getOrNull()
                ChatUnsend.from(message.data)?.takeIf { it.isFor(me) }?.let { PushCenter.removeChatLine(this, it.conversationId, it.messageId) }
            }
            PushArrival.Shown -> show(message, message.notification?.title ?: return)
            PushArrival.Nothing -> Unit
        }
    }

    private fun show(message: RemoteMessage, title: String) {
        PushCenter.show(
            this, title, message.notification?.body,
            route = message.data[PushCenter.EXTRA_ROUTE].orEmpty(),
            notificationId = message.data[PushCenter.EXTRA_NOTIFICATION_ID],
            fromUserId = message.data[PushCenter.EXTRA_FROM_USER_ID],
            // Tonight's card and a connection's new card go where the system would have put them (the "picks" channel).
            placement = PushPlacement.of(message.data),
        )
    }

    /**
     * A chat message, a pick, a note, a tap (A1 b): the person may open it in a moment, and an hour after the last use
     * both tokens have run out — the card page would then wait for App Check's Play Integrity round
     * trips and the ID token's refresh (~10 s). Both are asked for now, in the background (each is the
     * SDK's cached one while still good); production only, where ResonanceApp installed the provider.
     */
    private fun warmTokens() {
        if (BuildConfig.LOCAL_STACK) return
        runCatching {
            val app = FirebaseApp.getInstance()
            FirebaseAppCheck.getInstance(app).getAppCheckToken(false)
            FirebaseAuth.getInstance(app).currentUser?.getIdToken(false)
        }
    }
}

/**
 * What an arriving push is, read from its data's `type` and its notification's title — and whether
 * it warms the tokens. A chat message (data-only, its own road) warms them as a shown push does:
 * tapped an hour after the app's last use, the thread would otherwise wait out App Check and the
 * ID token (~10 s). An unsend only takes a line away; a push with nothing to show leads nowhere.
 */
internal enum class PushArrival(val warmsTokens: Boolean) {
    Chat(true), Unsend(false), Shown(true), Nothing(false);

    companion object {
        fun of(data: Map<String, String>, notificationTitle: String?): PushArrival = when {
            data["type"] == ChatPush.TYPE -> Chat
            data["type"] == ChatUnsend.TYPE -> Unsend
            notificationTitle != null -> Shown
            else -> Nothing
        }
    }
}
