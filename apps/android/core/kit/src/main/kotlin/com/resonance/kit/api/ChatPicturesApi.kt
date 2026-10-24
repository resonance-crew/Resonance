package com.resonance.kit.api

import com.resonance.api.models.ApiError
import com.resonance.api.models.ChatImageResponse
import com.resonance.api.models.ErrorCode
import com.resonance.kit.chat.ChatImage
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/**
 * Pictures in chat (round 7 §4): kept by the server for the two people of a conversation, with no
 * public address — so they are sent up and read back only with the viewer's ID token, through
 * [client] (the app's HTTP setup with the token on every call, as every v1 call has it), never a
 * plain image loader. The twin of iOS's ChatPictures.
 */
class ChatPicturesApi(private val configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) {
    /** The token on every call (refreshed once on a 401): what the thread's pictures are read through. */
    val client: OkHttpClient = apiClient(http, configuration)

    /** Which of a picture's two sizes: the thread's (at most 960 on its longest side), or as kept (at most 2048). */
    enum class Size { Thumb, Full }

    /** Where picture [id] is read (GET /api/v1/chat-images/{id}[?size=thumb]); `404` for anyone but the two of its conversation. */
    fun url(id: String, size: Size): String =
        configuration.apiUrl + "/chat-images/" + id + if (size == Size.Thumb) "?size=thumb" else ""

    /**
     * Sends a picture up to be sent [to] someone (POST /api/v1/chat-images): [bytes] already made
     * ready on the device (a JPEG, PNG, WebP or GIF of at most 4 MB). [clientId] is the message's own
     * client id — the picture is kept under it, so sending it again after a lost answer finds the one
     * already kept. Answers its id and its size as kept. The server's refusals are [ApiFailure]s with
     * its code and status: a file it can't take `400`, someone you can't message `403`, the day's
     * pictures used up `429`.
     */
    suspend fun upload(bytes: ByteArray, mimeType: String, to: String, clientId: String): ChatImage {
        val form = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", "picture." + extensionOf(mimeType), bytes.toRequestBody(mimeType.toMediaType()))
            .addFormDataPart("to", to)
            .addFormDataPart("clientId", clientId)
            .build()
        val url = configuration.apiUrl + "/chat-images"
        val body = blocking {
            client.newCall(Request.Builder().url(url).post(form).build()).execute().use { r ->
                if (!r.isSuccessful) throw failureOf(r)
                r.body?.string().orEmpty()
            }
        }
        val kept = json.decodeFromString(ChatImageResponse.serializer(), body)
        return ChatImage(kept.id, kept.width, kept.height)
    }

    private companion object {
        val json = Json { ignoreUnknownKeys = true }

        fun extensionOf(mimeType: String): String = when (mimeType.lowercase()) {
            "image/png" -> "png"
            "image/webp" -> "webp"
            "image/gif" -> "gif"
            else -> "jpg"
        }

        /** The contract's error (`{ error: { code, message } }`) as an [ApiFailure]; a body that isn't one keeps the status alone. */
        fun failureOf(r: Response): ApiFailure {
            val error = runCatching { json.decodeFromString(ApiError.serializer(), r.body?.string().orEmpty()) }.getOrNull()
            val code = error?.error?.code?.takeIf { it != ErrorCode.unknownDefaultOpenApi }?.value
            return when {
                error != null -> ApiFailure(code ?: "unexpected", error.error.message, r.code)
                r.code >= 500 -> ApiFailure("internal", "HTTP ${r.code}", r.code)
                else -> ApiFailure("unexpected", "HTTP ${r.code}", r.code)
            }
        }
    }
}
