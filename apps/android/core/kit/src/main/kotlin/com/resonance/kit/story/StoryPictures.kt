package com.resonance.kit.story

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Which story pictures the reader draws: one on the site's own host or a host under it (stored
 * pictures are on img.<site>), one written into the story (`data:image/`), or a path of the site's.
 * Any other is shown as a link the reader opens on purpose: a picture elsewhere is fetched by every
 * reader's device the moment the story opens, and its address, app and the time go to whoever runs
 * that host — an anonymous card's author too, on the page their notification opens. The web's
 * StoryMarkdown (drawnPicture) and the iOS kit keep the same rule. A host is read as the image loader
 * will fetch it (OkHttp's HttpUrl).
 */
object StoryPictures {
    /** The site's host (the API origin's), set when the API is configured; until then every picture is drawn. */
    @Volatile var siteHost: String? = null

    fun drawn(url: String): Boolean {
        val site = siteHost ?: return true
        val u = url.trim()
        if (u.startsWith("data:image/", ignoreCase = true)) return true
        if (u.startsWith("/") && !u.startsWith("//") && !u.startsWith("/\\")) return true
        val host = u.toHttpUrlOrNull()?.host?.trimEnd('.')?.lowercase() ?: return false
        return host == site || host.endsWith(".$site")
    }
}
