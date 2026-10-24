package com.resonance.app

import com.resonance.kit.api.ChatPicturesApi
import com.resonance.kit.api.MessagingApi
import com.resonance.kit.chat.Outbox
import kotlinx.coroutines.CoroutineScope

/**
 * One [Outbox] per conversation, kept for as long as the person is signed in: a message sent from a
 * thread goes on being sent when the thread is rotated, covered by a profile or left, and a failure
 * waits there to be retried when they come back. Emptied when the account signs out or another signs in.
 */
class ChatOutboxes(
    private val scope: CoroutineScope,
    private val messaging: MessagingApi,
    private val pictures: ChatPicturesApi,
    /** The first message a person sends is the moment to ask for notifications (see [PushCenter.reachedOut]). */
    private val sent: () -> Unit,
) {
    private val boxes = HashMap<String, Outbox>()

    /**
     * The outbox of the conversation [pairId] with [to]. A message with a picture sends it up first,
     * under the message's own client id — a resend finds it kept — and then names it ([deliver]).
     */
    fun of(pairId: String, to: String): Outbox = boxes.getOrPut(pairId) {
        Outbox(scope, deliver = { m ->
            val answer = deliver(messaging, pictures, to, m)
            sent()
            answer.id
        })
    }

    /** The conversation was deleted: what was waiting to go to it goes too. */
    fun forget(pairId: String) {
        boxes.remove(pairId)?.clear()
    }

    fun clear() {
        boxes.values.forEach(Outbox::clear)
        boxes.clear()
    }
}

/**
 * Sends [m] to [to]: its picture first, if it carries one (POST /api/v1/chat-images, under the
 * message's client id), then the message naming it (POST /api/v1/messages). Either refusing fails
 * the message as a refusal or a passing failure, as the outbox tells them apart.
 */
internal suspend fun deliver(messaging: MessagingApi, pictures: ChatPicturesApi, to: String, m: Outbox.Outgoing): MessagingApi.Sent {
    val image = m.image?.let { pictures.upload(it.bytes, it.mimeType, to, m.clientId).id }
    return messaging.sendMessage(to, m.text, m.cardRef, m.noteRef, replyTo = m.replyTo?.id, clientId = m.clientId, image = image)
}
