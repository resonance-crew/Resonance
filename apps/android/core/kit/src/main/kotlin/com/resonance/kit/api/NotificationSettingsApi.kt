package com.resonance.kit.api

import com.resonance.api.apis.DefaultApi
import com.resonance.api.models.NotificationSettings
import com.resonance.api.models.UpdateNotificationSettingsRequest
import com.resonance.kit.push.NotificationSwitch
import okhttp3.OkHttpClient

/**
 * The push switches (GET/PATCH /api/v1/me/notifications): messages and notes, on until turned
 * off, and the pushes a person asked for beyond the ones answering them, both off until turned on;
 * kept by the server for the account, so
 * every device of it follows the same switches. The twin of iOS's NotificationSettingsAPI; the
 * server's refusals surface as [ApiFailure].
 */
class NotificationSettingsApi(private val api: DefaultApi) {
    constructor(configuration: ApiConfiguration, http: OkHttpClient = OkHttpClient()) : this(
        DefaultApi(configuration.apiUrl, apiClient(http, configuration)),
    )

    suspend fun get(): NotificationSettings = call { api.getNotificationSettings() }

    /** Flips one switch (the others are sent as null, which leaves them alone); the answer is all of them, as stored now. */
    suspend fun set(switch: NotificationSwitch, on: Boolean): NotificationSettings = update(mapOf(switch to on))

    /** Sets the switches named in [changes] in one request (the rest are sent as null, left alone). */
    suspend fun update(changes: Map<NotificationSwitch, Boolean>): NotificationSettings = call {
        api.updateNotificationSettings(
            UpdateNotificationSettingsRequest(
                picks = changes[NotificationSwitch.Picks],
                connectionCards = changes[NotificationSwitch.ConnectionCards],
                messages = changes[NotificationSwitch.Messages],
            ),
        )
    }
}
