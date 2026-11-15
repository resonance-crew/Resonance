package com.resonance.app

import com.google.firebase.firestore.FieldValue
import com.resonance.design.CoverFraming
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

/**
 * Round 25 §G1, the draft's autosave (DraftService.update): a merge write merges `media` key by key, so a cover
 * written without a frame — a new picture, or the crop reset to the centre — has to delete `media.frame` itself,
 * or the old crop stays on the document and frames the new picture when it is published or reopened.
 */
class DraftUpdateTest {
    private val framed = DraftValues(
        title = "雨中散步", story = "那天下午雨停了。",
        imageUrl = "https://img.example/old.jpg", imageLabel = "old",
        imageFrame = CoverFraming.of(0.3, 0.6, 1.8, 1.5),
    )

    @Test fun aCoverWithItsFrameWritesTheFrame() {
        val media = draftUpdate(framed)["media"] as Map<*, *>
        assertEquals(framed.imageFrame!!.toMap(), media["frame"])
        assertEquals("https://img.example/old.jpg", media["url"])
    }

    @Test fun aNewPictureOrACentredCropDeletesTheOldFrame() {
        val replaced = framed.copy(imageUrl = "https://img.example/new.jpg", imageLabel = "new", imageFrame = null)
        val media = draftUpdate(replaced)["media"] as Map<*, *>
        assertEquals("https://img.example/new.jpg", media["url"])
        assertSame(FieldValue.delete(), media["frame"])

        val centred = framed.copy(imageFrame = null)
        assertSame(FieldValue.delete(), (draftUpdate(centred)["media"] as Map<*, *>)["frame"])
    }

    @Test fun noCoverDeletesTheWholeMedia() {
        val none = framed.copy(imageUrl = null, imageLabel = null, imageFrame = null)
        assertSame(FieldValue.delete(), draftUpdate(none)["media"])
    }
}
