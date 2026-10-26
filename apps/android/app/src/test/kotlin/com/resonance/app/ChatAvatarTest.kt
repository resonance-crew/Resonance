package com.resonance.app

import android.app.Application
import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import coil3.ImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.imageDecoderEnabled
import com.resonance.design.OklchColor
import com.resonance.design.generated.Tokens
import com.resonance.kit.chat.ChatPush
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.ByteArrayOutputStream
import kotlin.math.abs

/**
 * A chat message's notification wears its sender's own face — their photo, else their initials on
 * their colour — where the shade drew the system's letter before.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ChatAvatarTest {
    private val server = MockWebServer()
    @get:Rule val folder = TemporaryFolder()
    private val app: Application get() = RuntimeEnvironment.getApplication()

    @Before fun start() = server.start()
    @After fun stop() = server.shutdown()

    /** The app's loader, with a disk of the test's own and BitmapFactory to decode (as AppPicturesCacheTest has it). */
    private fun loader(): ImageLoader = ResonanceApp.imageLoader(app, OkHttpClient()).newBuilder()
        .diskCache { DiskCache.Builder().directory(folder.root).build() }
        .imageDecoderEnabled(false)
        .build()

    private val push = ChatPush("alice_bob", "m1", "alice", "bob", "小明", "hi", "/messages/小明", 1_790_000_000_000)
    private val sage = "oklch(90% 0.06 140)"

    /** A photo of one colour, as the storage would serve it. */
    private fun photo(color: Int): MockResponse {
        val bitmap = Bitmap.createBitmap(64, 48, Bitmap.Config.ARGB_8888).apply { eraseColor(color) }
        val png = ByteArrayOutputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it); it.toByteArray() }
        return MockResponse().setHeader("Content-Type", "image/png").setBody(Buffer().write(png))
    }

    private fun near(expected: Int, actual: Int, slack: Int = 6) {
        for (shift in listOf(24, 16, 8, 0)) {
            val e = (expected shr shift) and 0xff
            val a = (actual shr shift) and 0xff
            assertTrue("#%08x is not #%08x".format(actual, expected), abs(e - a) <= slack)
        }
    }

    @Test fun thePhotoFillsTheDiscAndNothingOutsideIt() {
        server.enqueue(photo(Color.rgb(200, 40, 60)))
        val face = ChatAvatar.draw(app, push.copy(fromAvatarUrl = server.url("/avatars/a.png").toString(), fromColor = sage), px = 96, loader = loader())
        assertEquals(96, face.width)
        near(Color.rgb(200, 40, 60), face.getPixel(48, 48))
        near(Color.rgb(200, 40, 60), face.getPixel(48, 6)) // the photo's middle square reaches the rim
        assertEquals(0, Color.alpha(face.getPixel(1, 1))) // round: the corners stay clear
    }

    @Test fun withoutAPhotoItIsTheirInitialsOnTheirColour() {
        val face = ChatAvatar.draw(app, push.copy(fromInitials = "小明", fromColor = sage), px = 96, loader = loader())
        val fill = OklchColor.parse(sage)!!.toArgb()
        near(fill, face.getPixel(48, 5)) // the disc, above the letters
        assertEquals(0, Color.alpha(face.getPixel(1, 1)))
        // The letters are inked somewhere across the middle.
        assertTrue((10 until 86).any { x -> face.getPixel(x, 48) != fill })
        assertEquals(0, server.requestCount)
    }

    @Test fun aPhotoThatDoesNotComeIsTheInitialsInstead() {
        server.enqueue(MockResponse().setResponseCode(404))
        val face = ChatAvatar.draw(app, push.copy(fromAvatarUrl = server.url("/avatars/gone.png").toString()), px = 96, loader = loader())
        // No colour on the profile (an older server): the avatar's own terracotta.
        near(Tokens.TerracottaLight.toArgb(), face.getPixel(48, 5))
        assertEquals(1, server.requestCount)
    }

    @Test fun initialsAreTheNamesFirstTwoLettersAsTheServerMakesThem() {
        assertEquals("BO", ChatAvatar.initialsOf(" bob "))
        assertEquals("小明", ChatAvatar.initialsOf("小明同學"))
        assertEquals("A", ChatAvatar.initialsOf("a"))
        assertEquals("𠀋A", ChatAvatar.initialsOf("𠀋ab")) // a letter beyond the BMP is one letter
        assertEquals("", ChatAvatar.initialsOf("  "))
    }

    @Test fun theNotificationsSenderWearsTheFaceOnEveryLine() {
        PushCenter.init(app)
        PushCenter.showChatMessage(app, push.copy(fromInitials = "小明", fromColor = sage))
        PushCenter.showChatMessage(app, push.copy(messageId = "m2", title = "小明二號", body = "again", sentAt = push.sentAt + 1))
        val shown = NotificationManagerCompat.from(app).activeNotifications.single { it.tag == "alice_bob" }
        val lines = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(shown.notification)!!.messages
        assertEquals(listOf("hi", "again"), lines.map { it.text.toString() })
        for (line in lines) {
            assertNotNull("${line.text} has a face", line.person?.icon)
            // The earlier line takes the sender's name as it is now.
            assertEquals("小明二號", line.person?.name.toString())
        }
    }
}
