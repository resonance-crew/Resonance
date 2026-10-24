package com.resonance.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.resonance.api.models.ApplyEditResponse
import com.resonance.api.models.PublishResponse
import com.resonance.api.models.RestoredCard
import com.resonance.app.DraftService
import com.resonance.app.DraftStore
import com.resonance.app.DraftValues
import com.resonance.app.PushCenter
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.WritingApi
import com.resonance.kit.images.AccentHue
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.io.ByteArrayOutputStream
import java.net.URL
import java.time.LocalTime
import kotlin.coroutines.cancellation.CancellationException
import kotlin.math.max
import kotlin.math.roundToInt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/** The writer's two steps (writer.spec §0): writing the title and the story, then 發布這張卡片 / 更新這張卡片. */
enum class WriterStep { Write, Publish }

/** Which of the publish step's buttons the work on its way is for — its one verb, or 捨棄修改: its loader shows, the other rests. */
enum class BusyVerb { Publish, Leave }

/**
 * The save state the writer's bar says after its title (round 8 §2.1): [Saving] once a write has
 * been on its way past [WriteModel.SAVING_SHOWN_MS] (a quicker one goes straight to the next word),
 * [Saved] after a draft's write, [SavedLive] after a published card's write to its pending edit
 * (and from the start when it opens with one), [Failed] when the last write didn't land.
 */
enum class SaveState { Saving, Saved, SavedLive, Failed }

/** The word for a save state (`write.status.*`). */
internal fun saveStateWord(state: SaveState): String = when (state) {
    SaveState.Saving -> L10n.Write.Status.saving
    SaveState.Saved -> L10n.Write.Status.saved
    SaveState.SavedLive -> L10n.Write.Status.savedLive
    SaveState.Failed -> L10n.Write.Status.failed
}

/**
 * The publish step's one button (round 8 §2.3), from the card and the choice: a 私人卡 (never
 * published, or published and kept private) is [Publish]ed or [PublishAnonymously] by its choice,
 * or kept one with [Save]; a card readers have now is [Update]d — or, 私人卡 chosen, turned back
 * into one ([MakeDraft], 轉為私人卡).
 */
enum class StepVerb { Publish, PublishAnonymously, Save, Update, MakeDraft }

/**
 * Where the writer goes once the step's verb went through: the card's page (its slug, or its id
 * before it has one) — whatever the verb, a 私人卡 kept or made one too (round 9 §1). The page takes
 * the writer's place, so back from it goes where the writer came from.
 */
sealed interface StepDone {
    data class Page(val key: String) : StepDone
}

/** What the publish step's mirror line shows: the question on its way, its answer, or nothing to say. */
sealed interface Mirror {
    data object Loading : Mirror
    data class Shown(val text: String) : Mirror
    data object None : Mirror
}

/** Whether the publish step tells a resonance's writer their card reaches its original's author. */
enum class ResonanceLine { Reaches, Quiet }

/**
 * 卡片類型 (round 8 §2.2; round 7's 誰可以看見): what the card is, as one choice — 公開 (under the
 * writer's pen name), 匿名公開, 草稿 ([Private]: its writer's alone, finished or not). Anonymity is
 * for being read: only the writer reading it needs no other name.
 */
enum class Audience { Public, Anonymous, Private }

/**
 * Which of the three a card's values show chosen: public under a name, public anonymous, private
 * (either way). A card kept for connections only (older ones) shows none, and keeps its audience
 * until one is picked.
 */
internal fun audienceOf(visibility: String, anonymous: Boolean): Audience? = when (visibility) {
    "public" -> if (anonymous) Audience.Anonymous else Audience.Public
    "private" -> Audience.Private
    else -> null
}

/** What going back asks before the writer goes ([WriteModel.leaveQuestion]; its words: [leaveBody]). */
enum class LeaveQuestion {
    /** 「寫下的內容已經存成草稿…」: a draft, kept on the way out. */
    Draft,
    /** 「你的修改已經存起來了…」: a live card's revision, kept in its buffer. */
    Revision,
    /**
     * The card is in the trash, where nothing is written until it is restored: what was typed since
     * the last save it took goes with the page (「這張卡片在垃圾桶裡，還原後才會儲存」).
     */
    Trashed,
}

/** What the writer asks of the server ([WritingApi] on screen; a stand-in under test). */
interface WriterCalls {
    suspend fun publish(cardId: String): PublishResponse
    suspend fun applyEdit(cardId: String): ApplyEditResponse
    suspend fun restoreCard(cardId: String): RestoredCard
    suspend fun suggestTags(title: String, story: String, tags: List<String>): List<String>
    suspend fun insight(title: String, story: String): String?
    suspend fun upload(image: ByteArray, filename: String): String
    fun illustrate(story: String): Flow<WritingApi.IllustrationEvent>
}

/** The writer's calls through the app's [WritingApi]. */
fun WritingApi.writerCalls(): WriterCalls {
    val api = this
    return object : WriterCalls {
        override suspend fun publish(cardId: String) = api.publish(cardId)
        override suspend fun applyEdit(cardId: String) = api.applyEdit(cardId)
        override suspend fun restoreCard(cardId: String) = api.restoreCard(cardId)
        override suspend fun suggestTags(title: String, story: String, tags: List<String>) = api.suggestTags(title, story, tags)
        override suspend fun insight(title: String, story: String) = api.insight(title, story)
        override suspend fun upload(image: ByteArray, filename: String) = api.upload(image, filename)
        override fun illustrate(story: String) = api.illustrate(story)
    }
}

/**
 * The writing screen's state and its work (CardEditor): the draft's values, autosave a moment after
 * typing stops, and the writer's two steps (writer.spec). Writing: the title and the story, and one
 * ✓ ([next]: a title asked for, a new draft saved first). Publishing: the mirror ([reflect]),
 * the card as a list will show it with its cover, tags, what the card is ([choose]: 公開 · 匿名公開 ·
 * 草稿) — all the draft's own values, autosaved like the words and kept on the way back to
 * writing — then one button whose verb follows the card and the choice ([finish], [stepVerb]):
 * 發布 · 匿名發布 a 草稿, 儲存 one kept a 草稿 (written, never published), 儲存修改 a card readers
 * have, or 轉為草稿 when 草稿 is chosen for it. Opened on a published card it revises: autosave
 * buffers the working copy privately, the verb applies it ([applyEdit]), and 捨棄修改
 * ([discardEdit]) drops it. The bar says how the writing is kept ([saveState]).
 *
 * A card moved to the trash elsewhere while it is open here (its saves refused, 409 'This card is in
 * the trash.') is read again, and the writer says so ([trashed]) back on the writing step, keeping
 * what is typed; [restore] takes it out and writes it. The twin of iOS's WriteModel. It owns its
 * scope so the last save still lands after the screen is gone ([leave]).
 */
class WriteModel(
    private val drafts: DraftStore?,
    private val writing: WriterCalls,
    referenceCardId: String?,
    val editor: StoryEditor,
    /** One of your cards to edit: a draft to resume, or a live card to revise. */
    opened: DraftService.OpenedCard? = null,
    /** The step it opens on (the screen keeps it across a restored process); a new card always writes first. */
    initialStep: WriterStep = WriterStep.Write,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
    /** Someone may now reach the account: the notification permission may be asked. */
    private val reachedOut: () -> Unit = { PushCenter.reachedOut() },
    /** The UI's language, a new card's. */
    private val locale: () -> String = { Strings.language.tag },
    /** How long ✓ waits for the server to take a new draft ([NEXT_WAIT_MS]; shorter under test). */
    private val nextWait: Long = NEXT_WAIT_MS,
    /** [opened] is a draft this writer began as a new card in this visit (the screen came back: a rotation, a restored process): its title stays 新卡片. */
    beganNew: Boolean = false,
) {
    /** The card this one resonates with, if any (a response card). */
    val referenceCardId: String? = opened?.referenceCardId ?: referenceCardId
    var values by mutableStateOf(opened?.values ?: DraftValues())
        private set
    var draftId: String? = opened?.id
        private set
    /** A new card was first saved, as a draft with this id. */
    var onCreated: (String) -> Unit = {}
    /** Something was written (a draft or revision saved, published, applied, dropped, restored), to the card with this id. */
    var onWrote: (String) -> Unit = {}
    var savedAt by mutableStateOf<LocalTime?>(null)
        private set
    /** Revising a live card (fixed for the model's lifetime, as on the web). */
    val isPublished: Boolean = opened?.isPublished ?: false
    /** A revision is waiting in the buffer — only its author can see it. */
    var hasPendingEdit by mutableStateOf(opened?.hasPendingEdit ?: false)
        private set
    /** The published card's slug (its page lives at slug ?: id). */
    val slug: String? = opened?.slug
    /** The live card already reaches its original: published, public and under its author's name (saving tells no one anything new). */
    val liveReaches: Boolean = opened != null && opened.isPublished && opened.liveVisibility == "public" && !opened.liveAnonymous
    /**
     * Readers have the card now: published and not kept private — a published private card is a 草稿
     * to everyone, its writer too (round 8 §1). Fixed for the model's lifetime, as [isPublished].
     */
    val liveSeen: Boolean = opened != null && opened.isPublished && opened.liveVisibility != "private"
    /** Opened on a card of yours (not one begun here in this visit): its title says what it is. */
    private val editing = opened != null && !beganNew
    var tagDraft by mutableStateOf("")
    var suggestingTags by mutableStateOf(false)
        private set
    var tagError by mutableStateOf<String?>(null)
        private set
    var uploadingCover by mutableStateOf(false)
        private set
    var uploadingInline by mutableStateOf(false)
        private set
    var generating by mutableStateOf(false)
        private set
    /** The illustration's in-progress pass while it renders. */
    var partialPreview by mutableStateOf<Bitmap?>(null)
        private set
    /** Why the cover's last picture didn't work (pick, upload, illustration): said on the picture itself, gone with its next action. */
    var mediaError by mutableStateOf<String?>(null)
        private set
    /**
     * A picture for the story didn't go in (it couldn't be read, or its upload failed): said where the
     * writing is, as the shell's toast — never in the cover's slot ([mediaError]).
     */
    var onStoryPictureError: (String) -> Unit = {}

    // The save state ([saveState])

    /** A write has been on its way past [SAVING_SHOWN_MS]. */
    private var savingShown by mutableStateOf(false)
    /** The last write didn't land (the next pause tries again). */
    private var writeFailed by mutableStateOf(false)

    // The steps

    var step by mutableStateOf(if (opened != null) initialStep else WriterStep.Write)
        private set
    /** 下一步 found no title: said under it, until the next keystroke. */
    var titleError by mutableStateOf(false)
        private set
    /** Bumped when the title should take the focus (no title at 下一步 or 發布). */
    var titleFocus by mutableIntStateOf(0)
        private set
    /** 下一步's save of a new draft didn't go through: said under the save line. */
    var saveError by mutableStateOf<String?>(null)
        private set
    /** 下一步 has waited on a new draft's first save long enough to show its loader. */
    var nextLoading by mutableStateOf(false)
        private set
    private var nextBusy = false
    /** Publishing, saving changes, dropping them or leaving is on its way: the step's controls and the bar's back wait. */
    var pending by mutableStateOf(false)
        private set
    var busyVerb by mutableStateOf(BusyVerb.Publish)
        private set
    /** Why the step's last try didn't go through, in the writer's words. */
    var publishError by mutableStateOf<String?>(null)
        private set
    /** What the mirror line shows (null: not asked). */
    var mirror by mutableStateOf<Mirror?>(null)
        private set
    private var reflection: Pair<String, String?>? = null
    private var reflecting: Job? = null

    // The trash

    /** Moved to the trash elsewhere while open here: nothing is written until it is restored. */
    var trashed by mutableStateOf(false)
        private set
    var restoring by mutableStateOf(false)
        private set
    var restoreError by mutableStateOf<String?>(null)
        private set

    /** Uploading or illustrating the cover — the picture's slot waits either way. */
    val mediaBusy: Boolean get() = uploadingCover || generating
    /** A picture is still on its way, the cover or one in the story: 發布 waits (mediaBusyHint). */
    val verbWaits: Boolean get() = mediaBusy || uploadingInline
    /** The web's canGenerate: there is a story to draw from. */
    val canGenerate: Boolean get() = values.story.isNotBlank() && !mediaBusy

    private var saveJob: Job? = null
    /** Writes run one after another, so a slow create can't race the next update. */
    private val writes = Mutex()
    /** What the last successful write stored; an unchanged working copy isn't written again (and opening a card writes nothing). */
    private var lastSaved: DraftValues? = opened?.values
    /** Why the last write didn't land (null: it did). */
    private var lastFailure: Exception? = null
    /** Done with this card (published, its changes applied or dropped): nothing more is written into it. */
    private var closed = false

    init {
        opened?.values?.title?.takeIf { it.isNotEmpty() }?.let(editor::setTitle)
        opened?.let { editor.setMarkdown(it.values.story) }
        editor.onChange = { story -> update { copy(story = story) } }
    }

    /**
     * The page title, short at every size: 新卡片 (kept after its first save in this visit), 編輯草稿
     * for a 草稿 (never published, or published and private), 編輯卡片 for a card readers have.
     */
    val title: String
        get() = writerTitle(editing, liveSeen)

    /** Who the card is for, as the step shows it chosen (null: kept for connections, none chosen). */
    val audience: Audience? get() = audienceOf(values.visibility, values.anonymous)

    /**
     * The step's one button (round 8 §2.3): a card readers have is updated (儲存修改), or made a 草稿
     * again (轉為草稿) when that is chosen; a 草稿 is published by its choice (發布 · 匿名發布), or kept
     * one (儲存). A card kept for connections only (older ones, none of the three chosen) reads as
     * publishing — or, live, as an update.
     */
    val stepVerb: StepVerb get() = stepVerbOf(liveSeen, audience)

    /** The publish step's title: 更新這張卡片 for a card readers have, else 儲存草稿 with 草稿 chosen and 發布這張卡片 otherwise. */
    val stepTitle: String get() = stepTitleOf(liveSeen, audience)

    /** The step's one button's words ([stepVerb]). */
    val verb: String get() = verbWords(stepVerb)

    /** The verb's shorter words while it works (儲存修改 → 儲存), or none. */
    val verbBusyLabel: String? get() = if (stepVerb == StepVerb.Update) L10n.Write.saveShort else null

    /**
     * A live card's 「按下之後，讀者看到的就會是這個版本…」: only for a card readers have whose choice keeps
     * it theirs (公開 · 匿名公開; an older card kept for connections, none chosen, still has them).
     */
    val showsUpdateHint: Boolean get() = liveSeen && values.visibility != "private"

    /**
     * What the bar says of the writing after its title (null: nothing yet — before the card's first
     * write in this visit, and for a card in the trash, which keeps its own line in the page).
     */
    val saveState: SaveState?
        get() = when {
            trashed -> null
            savingShown -> SaveState.Saving
            writeFailed -> SaveState.Failed
            isPublished -> if (savedAt != null || hasPendingEdit) SaveState.SavedLive else null
            savedAt != null -> SaveState.Saved
            else -> null
        }

    /** The card's page: its slug, or its id (a draft, or a card without one). */
    val routeKey: String? get() = slug ?: draftId

    /** Whether going back leaves something written behind (it is kept; the person is asked first): see [holdsWork]. */
    val hasWork: Boolean get() = holdsWork(isPublished, values, lastSaved, draftId != null, hasPendingEdit)

    /**
     * Whether — and what — going back asks before the writer goes (null: it goes at once), never
     * saying writing is kept that the trash refuses: a card in the trash asks only for words it holds
     * nowhere ([LeaveQuestion.Trashed]); anything else as [hasWork] says.
     */
    val leaveQuestion: LeaveQuestion?
        get() = when {
            trashed -> if (needsSave) LeaveQuestion.Trashed else null
            !hasWork -> null
            isPublished -> LeaveQuestion.Revision
            else -> LeaveQuestion.Draft
        }

    /** What is on screen differs from what was last written, and is worth writing (a blank new card isn't). */
    val needsSave: Boolean get() = values != lastSaved && !(draftId == null && values.isEmpty)

    /** ✓ shows: while writing, and not for a card in the trash. */
    val showsNext: Boolean get() = step == WriterStep.Write && !trashed

    /** ✓ can be pressed: a draft needs something written (a title, words, tags or a cover); a live card always can. */
    val nextEnabled: Boolean get() = isPublished || !values.isEmpty

    /** 捨棄修改, the step's one other button: a published card's, only while it has a revision to drop. */
    val showsWayOut: Boolean get() = isPublished && (hasPendingEdit || values != lastSaved)

    /** The publish step's resonance line (null: none). */
    val resonanceLine: ResonanceLine?
        get() = resonanceLine(referenceCardId != null, isPublished, liveReaches, values.visibility, values.anonymous)

    fun update(change: DraftValues.() -> DraftValues) {
        val next = values.change()
        if (next == values) return
        values = next
        scheduleSave()
    }

    /** The title as typed: one line (a line break is a space), at most [TITLE_MAX]; the island reads the story's type with it. */
    fun setTitle(text: String) {
        val line = oneLine(text)
        titleError = false
        update { copy(title = line) }
        editor.setTitle(line)
    }

    /** Who can see it and under whose name, in one change — so no write is ever anonymous and for connections only. */
    fun setAudience(visibility: String, anonymous: Boolean) =
        update { copy(visibility = anonymousVisibility(visibility, anonymous), anonymous = anonymous) }

    /**
     * One of 卡片類型's three, both fields in one change: 公開 is public under the pen name, 匿名公開
     * public and anonymous. 草稿 names a draft (it was never read by anyone: no anonymous flag is
     * left over from trying 匿名公開), and leaves a published card's anonymity as it is — an anonymous
     * card made a 草稿, then public again, comes back anonymous, never under its author's name.
     */
    fun choose(audience: Audience) = when (audience) {
        Audience.Public -> setAudience("public", anonymous = false)
        Audience.Anonymous -> setAudience("public", anonymous = true)
        Audience.Private -> setAudience("private", anonymous = isPublished && values.anonymous)
    }

    // Autosave

    private fun scheduleSave() {
        saveJob?.cancel()
        // Only the wait can be cancelled: a write that has begun always finishes, so
        // a create can't lose its id and a second save can't create a duplicate draft.
        saveJob = scope.launch {
            delay(AUTOSAVE_DELAY_MS)
            saveSaying()
        }
    }

    /** Writes the draft now (creating it the first time there is something to keep); returns its id. */
    suspend fun saveNow(): String? {
        saveJob?.cancel()
        return save()
    }

    /** A save in the background: one the rules refused for a card in the trash says so. */
    private suspend fun saveSaying() {
        save()
        lastFailure?.let { confirmTrashed(it) }
    }

    /** The app is going to the background: what is written now is saved now, not 1.5s later (the web's visibilitychange flush). */
    fun flush() {
        scope.launch { saveSaying() }
    }

    private suspend fun save(force: Boolean = false): String? = writes.withLock { withContext(NonCancellable) { write(force) } }

    private suspend fun write(force: Boolean): String? {
        val drafts = drafts ?: return draftId
        if (closed || trashed) return draftId
        val v = values
        if (v.isEmpty && draftId == null) return null
        if (v == lastSaved && !force) return draftId
        // Said in the bar only once it runs long; whether it went through, always.
        val shown = scope.launch {
            delay(SAVING_SHOWN_MS)
            savingShown = true
        }
        try {
            val id = draftId
            if (isPublished && id != null) {
                // A live card: the revision waits privately in its buffer.
                drafts.saveEdit(id, v)
                hasPendingEdit = true
            } else if (id != null) {
                drafts.update(id, v)
            } else {
                // The id is the writer's from the moment the create is issued (the draft is on the device
                // then), so 下一步 can open the step while the server's yes is still on its way.
                val created = drafts.newDraftId()
                draftId = created
                onCreated(created)
                try {
                    drafts.create(created, v, locale(), referenceCardId)
                } catch (e: Exception) {
                    // Refused: no document under that id, and the next save creates one afresh.
                    if (draftId == created) draftId = null
                    throw e
                }
            }
            lastSaved = v
            lastFailure = null
            writeFailed = false
            savedAt = LocalTime.now()
            draftId?.let(onWrote)
        } catch (e: Exception) {
            // Kept in memory; the next edit (or leaving) tries again.
            lastFailure = e
            writeFailed = true
        } finally {
            shown.cancel()
            savingShown = false
        }
        return draftId
    }

    /**
     * The screen is going away: the last edit is saved — or, a card begun here and emptied again,
     * let go of ([dropIfEmpty]) — then the model stops.
     */
    fun leave() {
        scope.launch {
            try {
                saveNow()
                dropIfEmpty()
            } finally {
                editor.destroy()
                scope.cancel()
            }
        }
    }

    /**
     * No empty 私人卡 (round 9 §1): a card is only made once something is written in it, and one begun
     * in this writer (not a card of yours opened here) left with nothing in it — no title, no story, no
     * tags, no cover: written, then taken out again — is deleted on the way out, so it isn't left on
     * the 私人卡 shelf or the thought map's tray. A card that couldn't be deleted (offline) stays, as
     * any draft. Returns whether it went.
     */
    internal suspend fun dropIfEmpty(): Boolean {
        val id = draftId ?: return false
        val drafts = drafts ?: return false
        if (editing || isPublished || closed || trashed || !values.isEmpty) return false
        val gone = writes.withLock {
            withContext(NonCancellable) {
                try {
                    drafts.delete(id)
                    true
                } catch (e: Exception) {
                    false
                }
            }
        }
        if (gone) {
            draftId = null
            lastSaved = null
            closed = true
            onWrote(id)
        }
        return gone
    }

    // Moving between the steps

    /** No title: back on the writing step, the title asking for one. */
    private fun askForTitle() {
        titleError = true
        step = WriterStep.Write
        titleFocus++
    }

    /**
     * ✓ (完成): asks for a title, makes sure a new card is saved as a draft first (its writer is then a
     * draft's, as a reload or the system's back must find it), and opens the publish step. A new
     * draft's create is issued and the server's answer waited on at most [nextWait] — a refusal keeps
     * the writer here and says so; past it (offline: Firestore holds the write until the network
     * comes back) the step opens on the draft on the device. A draft kept already saves on its way,
     * and the step opens at once. Returns whether the step opened.
     */
    suspend fun next(): Boolean {
        if (nextBusy || pending || trashed || step != WriterStep.Write || !nextEnabled) return false
        if (values.title.isBlank()) {
            askForTitle()
            return false
        }
        saveError = null
        settleAudience()
        if (draftId == null) {
            nextBusy = true
            val loader = scope.launch {
                delay(NEXT_LOADER_MS)
                nextLoading = true
            }
            try {
                saveJob?.cancel()
                // In the model's scope, so the write goes on past the wait.
                val saving = scope.launch { save() }
                withTimeoutOrNull(nextWait) { saving.join() }
                if (draftId == null) {
                    saveError = L10n.Native.saveError
                    return false
                }
            } finally {
                loader.cancel()
                nextLoading = false
                nextBusy = false
            }
        } else if (needsSave) {
            saveJob?.cancel()
            scope.launch { saveSaying() }
        }
        step = WriterStep.Publish
        return true
    }

    /**
     * Back from the publish step to writing (its bar's arrow, 繼續寫, the system's back): true, or —
     * while writing, nothing to step back to — false, and the page's own way out answers. Work on its
     * way holds it there (true: nothing else happens).
     */
    fun back(): Boolean {
        if (step != WriterStep.Publish) return false
        if (!pending) {
            step = WriterStep.Write
            stopReflecting()
        }
        return true
    }

    /**
     * The mirror, as the publish step opens: asked once per distinct title and story — coming back
     * with the same words shows the answer it had — never for a live card's revision, never for an
     * untitled draft. [stopReflecting] drops a question on its way when the step closes.
     */
    fun reflect() {
        if (isPublished || values.title.isBlank()) return
        val title = values.title
        val story = values.story
        val key = title + "\u0000" + story
        reflection?.let { (known, answer) ->
            if (known == key) {
                mirror = answer?.let(Mirror::Shown) ?: Mirror.None
                return
            }
        }
        reflecting?.cancel()
        mirror = Mirror.Loading
        reflecting = scope.launch {
            val answer = try {
                writing.insight(title, story)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                null
            }
            reflection = key to answer
            mirror = answer?.let(Mirror::Shown) ?: Mirror.None
        }
    }

    fun stopReflecting() {
        reflecting?.cancel()
        reflecting = null
    }

    /**
     * A card about to be first published keeps no audience the server refuses: a draft stored
     * anonymous and for connections only (the rules let a draft hold the pair, and the builds before
     * letters kept a web draft's audience beside their anonymous switch) goes public, as making it
     * anonymous here would have — so the step shows 公開 chosen and 發布 is never a 400 however often
     * it is tried. A live card already that way keeps both (the server lets it).
     */
    private fun settleAudience() {
        if (isPublished) return
        val audience = anonymousVisibility(values.visibility, values.anonymous)
        if (audience != values.visibility) update { copy(visibility = audience) }
    }

    // The publish step's verbs

    /**
     * The step's one button ([stepVerb]), and the card's page the writer goes to once it went through
     * (null: it didn't — [publishError] or [trashed] says why): a 私人卡 published (發布 · 匿名發布: a
     * draft through the publish call, a published private card through its pending edit, keeping its
     * first date); a 私人卡 kept one (儲存: a draft written as it is on screen — never published, not
     * even to its writer alone — or a published private card's edit applied); a card readers have
     * updated (儲存修改) or turned back into a 私人卡 (轉為私人卡: the edit applied, now private). Every
     * one lands on the card's page (round 9 §1). Saying why it failed: 沒發布成功 for a publish, 沒儲存成功
     * for the rest.
     */
    suspend fun finish(): StepDone.Page? {
        val failed = failureFallback(stepVerb)
        val key = when (stepVerb) {
            StepVerb.Publish, StepVerb.PublishAnonymously -> if (isPublished) applyEdit(failed, publishes = true) else publish(failed)
            // A 私人卡 kept one: written as it is on screen (never published), or a published one's edit applied.
            StepVerb.Save -> if (isPublished) applyEdit(failed) else if (keepDraft(failed)) routeKey else null
            StepVerb.Update, StepVerb.MakeDraft -> applyEdit(failed)
        }
        return key?.let(StepDone::Page)
    }

    /**
     * Saves the draft, then publishes it, and returns where the card lives (null: it didn't, and
     * [publishError] or [trashed] says why, [failed] for anything else).
     */
    private suspend fun publish(failed: String): String? {
        if (pending) return null
        if (values.title.isBlank()) {
            askForTitle()
            return null
        }
        settleAudience()
        return working(BusyVerb.Publish, failed) {
            val id = saveNow()
            if (id == null || values != lastSaved) return@working failedSave(failed)
            val result = writing.publish(id)
            closed = true
            onWrote(id)
            reachedOut()
            result.slug ?: result.id
        }
    }

    /**
     * A published card's working copy (with the step's choices) goes into its buffer, then the server
     * makes it the card — the moment an edit reaches readers, or (made a 草稿) leaves them, or ([publishes]:
     * a published private card made public) reaches them again. The publish date stays. Returns where
     * the card lives (null: it didn't, and [publishError] or [trashed] says why, [failed] for anything else).
     */
    private suspend fun applyEdit(failed: String, publishes: Boolean = false): String? {
        val id = draftId ?: return null
        if (pending) return null
        if (values.title.isBlank()) {
            askForTitle()
            return null
        }
        return working(BusyVerb.Publish, failed) {
            // The server applies what is in the buffer: written now, even when nothing changed since the last save.
            saveJob?.cancel()
            save(force = true)
            if (values != lastSaved || lastFailure != null) return@working failedSave(failed)
            val result = writing.applyEdit(id)
            if (!result.applied) {
                // The buffer was gone by then (applied or dropped elsewhere): the words on screen may not be
                // live and are kept nowhere — owed a save again, so a retry or leaving writes them.
                lastSaved = null
                publishError = failed
                return@working null
            }
            closed = true
            onWrote(id)
            hasPendingEdit = false
            if (publishes) reachedOut()
            result.slug ?: slug ?: id
        }
    }

    /** 捨棄修改: the buffer goes; the live card was never touched. Returns where the card lives (null: it didn't go). */
    suspend fun discardEdit(): String? {
        val id = draftId ?: return null
        val drafts = drafts ?: return null
        if (pending) return null
        return working(BusyVerb.Leave, L10n.Safety.actionError) {
            saveJob?.cancel()
            // Behind any autosave in flight, so a straggling write can't re-create the buffer.
            writes.withLock { drafts.discardEdit(id) }
            onWrote(id)
            hasPendingEdit = false
            lastSaved = values
            closed = true
            slug ?: id
        }
    }

    /**
     * 儲存 for a draft never published, 草稿 chosen: what is on screen is written now (not left to the
     * pause) and nothing more — true once it is, and the writer may go.
     */
    private suspend fun keepDraft(failed: String): Boolean {
        if (pending) return false
        if (values.title.isBlank()) {
            askForTitle()
            return false
        }
        return working(BusyVerb.Publish, failed) {
            if (needsSave) {
                saveNow()
                if (values != lastSaved) return@working failedSave(failed)
            }
            true
        } == true
    }

    /**
     * Runs the step's verb with its buttons waiting: a refusal the trash would explain is read
     * again and said as such (back on the writing step); anything else is [publishError], in the
     * writer's words ([failureText] with [fallback]).
     */
    private suspend fun <T> working(verb: BusyVerb, fallback: String, block: suspend () -> T?): T? {
        busyVerb = verb
        pending = true
        publishError = null
        return try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (!confirmTrashed(e)) publishError = failureText(e, fallback)
            null
        } finally {
            pending = false
        }
    }

    /** The save the verb waited on didn't land: the trash, or [fallback]. Null either way. */
    private suspend fun failedSave(fallback: String): Nothing? {
        val failure = lastFailure
        if (!confirmTrashed(failure)) publishError = failureText(failure, fallback)
        return null
    }

    // The trash

    /** A refusal the card being in the trash could explain: the server's 409, or the rules refusing a write. */
    private fun mayBeTrashed(e: Throwable): Boolean = (e as? ApiFailure)?.isInTrash == true || drafts?.refused(e) == true

    /**
     * A write or a verb was refused in a way the trash would explain: the card is read again, and if
     * it is there the writer says so (with 還原), back on the writing step, keeping everything typed.
     * A read that fails takes the server's 409 at its word.
     */
    internal suspend fun confirmTrashed(e: Throwable?): Boolean {
        val id = draftId ?: return false
        if (e == null || !mayBeTrashed(e)) return false
        val inTrash = try {
            drafts?.isTrashed(id)
        } catch (c: CancellationException) {
            throw c
        } catch (_: Exception) {
            null
        } ?: ((e as? ApiFailure)?.isInTrash == true)
        if (!inTrash) return false
        trashed = true
        restoreError = null
        if (step != WriterStep.Write) {
            step = WriterStep.Write
            stopReflecting()
        }
        return true
    }

    /**
     * 還原: out of the trash, as it was; what was typed meanwhile is written at once. Returns whether
     * it came back standing alone (`droppedResonance`), or null when it didn't come back
     * ([restoreError] says so).
     */
    suspend fun restore(): Boolean? {
        val id = draftId ?: return null
        if (restoring) return null
        restoring = true
        restoreError = null
        return try {
            val restored = writing.restoreCard(id)
            trashed = false
            onWrote(id)
            if (!closed && needsSave) saveNow()
            restored.droppedResonance
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            restoreError = L10n.Safety.actionError
            null
        } finally {
            restoring = false
        }
    }

    // Tags

    /** Add what is in the field as a tag (Done, or the field's Add): trimmed, and not twice. */
    fun addTag() {
        val word = tagDraft
        tagDraft = ""
        addTags(listOf(word))
    }

    /** The field's text as typed or pasted: a comma ends a tag (see [TagInput]), the rest stays to be typed on. */
    fun typeTag(text: String) {
        val (words, rest) = TagInput.split(text)
        tagDraft = rest
        if (words.isNotEmpty()) addTags(words)
    }

    private fun addTags(words: List<String>) = update { copy(tags = TagInput.merge(tags, words)) }

    fun removeTag(tag: String) = update { copy(tags = tags - tag) }

    /** Backspace in an empty field takes the last tag back. */
    fun removeLastTag() = update { copy(tags = tags.dropLast(1)) }

    /** Two or three from the model, informed by the author's past tags; new ones only. */
    fun suggestTags() {
        if (suggestingTags) return
        tagError = null
        suggestingTags = true
        scope.launch {
            try {
                val suggested = writing.suggestTags(values.title, values.story, values.tags)
                // The field stays open meanwhile: merge into the tags as they are now.
                update { copy(tags = tags + suggested.filter { it !in tags }) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                tagError = L10n.Write.tagsSuggestError
            } finally {
                suggestingTags = false
            }
        }
    }

    // Images

    /** The cover: compressed here, uploaded, and its hue read from the local pixels. */
    fun setCover(context: Context, uri: Uri) {
        if (mediaBusy) return
        mediaError = null
        uploadingCover = true
        scope.launch {
            try {
                val (jpeg, hue) = withContext(Dispatchers.Default) {
                    val bitmap = CoverImage.decode(context, uri)
                    CoverImage.jpeg(bitmap) to CoverImage.accentHue(bitmap)
                }
                val url = writing.upload(jpeg, "cover.jpg")
                update { copy(imageUrl = url, imageLabel = "cover.jpg", accentHue = hue) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mediaError = L10n.Write.mediaUploadError
            } finally {
                uploadingCover = false
            }
        }
    }

    /**
     * An illustration drawn from the story (/api/generate-image): its previews
     * show as they arrive; the stored picture becomes the cover, its hue read
     * from that picture (or, failing that, the last preview).
     */
    fun generateCover() {
        if (!canGenerate) return
        mediaError = null
        generating = true
        scope.launch {
            try {
                var stored: String? = null
                var failed = false
                writing.illustrate(values.story).collect { event ->
                    when (event) {
                        is WritingApi.IllustrationEvent.Partial ->
                            withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(event.png, 0, event.png.size) }?.let { partialPreview = it }
                        is WritingApi.IllustrationEvent.Done -> stored = event.url
                        WritingApi.IllustrationEvent.Failed -> failed = true
                    }
                }
                val url = stored
                if (failed || url == null) {
                    mediaError = L10n.Write.mediaGenerateError
                    return@launch
                }
                val preview = partialPreview
                val hue = withContext(Dispatchers.IO) {
                    val picture = runCatching { URL(url).readBytes() }.getOrNull()?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
                    (picture ?: preview)?.let(CoverImage::accentHue)
                }
                update { copy(imageUrl = url, imageLabel = L10n.Write.mediaGeneratedLabel, accentHue = hue) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mediaError = L10n.Write.mediaGenerateError
            } finally {
                generating = false
                partialPreview = null
            }
        }
    }

    /** No cover: the card's stripes again, and whatever the last picture's failure said goes with it. */
    fun removeCover() {
        mediaError = null
        update { copy(imageUrl = null, imageLabel = null, accentHue = null) }
    }

    /** A photo inside the story (the format bar's 插入圖片), read on the device first. */
    fun insertImage(context: Context, uri: Uri) =
        insertPicture { withContext(Dispatchers.Default) { CoverImage.jpeg(CoverImage.decode(context, uri)) } }

    /**
     * A picture inside the story: [read] makes it ready (a JPEG), then it is uploaded and the island
     * puts it at the story's caret. One that can't be read or encoded says 讀不出這張圖片; an upload
     * that fails says 圖片上傳失敗 — both where the writing is ([onStoryPictureError], the shell's
     * toast), never in the cover's slot.
     */
    internal fun insertPicture(read: suspend () -> ByteArray) {
        if (uploadingInline) return
        uploadingInline = true
        scope.launch {
            try {
                val jpeg = try {
                    read().takeIf { it.isNotEmpty() } ?: throw IllegalArgumentException("empty picture")
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    onStoryPictureError(L10n.Write.Editor.imageUnsupported)
                    return@launch
                }
                val url = writing.upload(jpeg, "photo.jpg")
                editor.exec("insertImage", mapOf("src" to url, "alt" to "photo.jpg"))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onStoryPictureError(L10n.Write.Editor.imageUploadError)
            } finally {
                uploadingInline = false
            }
        }
    }

    companion object {
        /** CardEditor's AUTOSAVE_DELAY_MS (leaving, or going to the background, saves at once). */
        const val AUTOSAVE_DELAY_MS = 1500L
        const val TITLE_MAX = 60
        /** How long ✓ waits on a new draft's first save before its glyph becomes the loader. */
        const val NEXT_LOADER_MS = 300L
        /** How long a write runs before the bar says 儲存中⋯ (a quicker one goes straight to its next word: no flicker). */
        const val SAVING_SHOWN_MS = 400L
        /**
         * How long 下一步 waits for the server to take a new draft (iOS's nextWait): the draft is on the
         * device either way, so past this the step opens, and publishing waits for the network as it always has.
         */
        const val NEXT_WAIT_MS = 3000L
    }
}

/**
 * The writer's title (round 8 §2.1), short at every size: 新卡片 for a new card ([editing] false),
 * 編輯卡片 for a card readers have ([seen]), 編輯草稿 for a 草稿 — a draft, or a published card kept private.
 */
internal fun writerTitle(editing: Boolean, seen: Boolean): String = when {
    !editing -> L10n.Write.title
    seen -> L10n.Write.editPublishedTitle
    else -> L10n.Write.editTitle
}

/** The step's one button for a card readers have or not ([seen]) and what is chosen ([audience]; null: kept for connections). */
internal fun stepVerbOf(seen: Boolean, audience: Audience?): StepVerb = when {
    seen -> if (audience == Audience.Private) StepVerb.MakeDraft else StepVerb.Update
    audience == Audience.Private -> StepVerb.Save
    audience == Audience.Anonymous -> StepVerb.PublishAnonymously
    else -> StepVerb.Publish
}

/** The step's title: 更新這張卡片 for a card readers have; else 儲存草稿 with 草稿 chosen, 發布這張卡片 otherwise. */
internal fun stepTitleOf(seen: Boolean, audience: Audience?): String = when {
    seen -> L10n.Write.PublishPanel.updateTitle
    audience == Audience.Private -> L10n.Write.PublishPanel.saveTitle
    else -> L10n.Write.PublishPanel.title
}

/** A step verb's words: 發布 · 匿名發布 · 儲存 · 儲存修改 · 轉為草稿. */
internal fun verbWords(verb: StepVerb): String = when (verb) {
    StepVerb.Publish -> L10n.Write.PublishPanel.publish
    StepVerb.PublishAnonymously -> L10n.Write.PublishPanel.publishAnonymously
    StepVerb.Save -> L10n.Write.PublishPanel.save
    StepVerb.Update -> L10n.Write.PublishPanel.update
    StepVerb.MakeDraft -> L10n.Write.PublishPanel.makeDraft
}

/** What a verb that didn't go through says (the day's limit and a gone card aside, [failureText]): 沒發布成功 for a publish, 沒儲存成功 otherwise. */
internal fun failureFallback(verb: StepVerb): String = when (verb) {
    StepVerb.Publish, StepVerb.PublishAnonymously -> L10n.Write.PublishPanel.failed
    else -> L10n.Write.PublishPanel.saveFailed
}

/** What a one-line title holds in place of a line break (a pasted one). */
private val LINE_BREAK = Regex("\r\n|[\r\n]")

/** The title is one line — a line break typed or pasted into it is a space — at most [WriteModel.TITLE_MAX], never half a character. */
internal fun oneLine(text: String): String {
    val line = text.replace(LINE_BREAK, " ")
    if (line.length <= WriteModel.TITLE_MAX) return line
    val cut = if (Character.isHighSurrogate(line[WriteModel.TITLE_MAX - 1])) WriteModel.TITLE_MAX - 1 else WriteModel.TITLE_MAX
    return line.take(cut)
}

/**
 * Whether the writer holds anything worth asking about before it goes: a new card or draft with
 * words, a title, tags or a cover in it that is kept (`saved`: it has a draft) or is about to be;
 * a live card's revision, waiting in its buffer (`pendingEdit`) or typed and not saved yet.
 */
internal fun holdsWork(isPublished: Boolean, values: DraftValues, lastSaved: DraftValues?, saved: Boolean, pendingEdit: Boolean): Boolean =
    if (isPublished) pendingEdit || values != lastSaved
    else !values.isEmpty && (saved || values != lastSaved)

/**
 * Who sees a card that is [anonymous]: an anonymous card is public or only its author's, never for
 * connections only (who would know whose it is), so one kept for connections becomes public; any
 * other choice stands.
 */
internal fun anonymousVisibility(visibility: String, anonymous: Boolean): String =
    if (anonymous && visibility == "connections") "public" else visibility

/** What the leave question says: that the writing is kept — or, for a card in the trash, that nothing is kept until it is restored. */
internal fun leaveBody(question: LeaveQuestion?): String = when (question) {
    LeaveQuestion.Trashed -> L10n.Write.Trashed.status
    LeaveQuestion.Revision -> L10n.Write.leaveBodyRevision
    LeaveQuestion.Draft, null -> L10n.Write.leaveBody
}

/** Whether a card in this audience reaches the card it answers: public and under its author's name. */
internal fun reachesOriginal(visibility: String, anonymous: Boolean): Boolean = visibility == "public" && !anonymous

/**
 * The publish step's line for a resonance (none for a card answering nothing): before its first
 * publication, whether it will reach its original's author (公開並署名的共振，會讓原作者知道是你) or
 * not (這張共振不會通知原作者); for a live one, only when this save makes a hidden one public and
 * named ([liveReaches] false, the audience now reaching) — then it reaches its original, as making it
 * public would.
 */
internal fun resonanceLine(resonance: Boolean, updating: Boolean, liveReaches: Boolean, visibility: String, anonymous: Boolean): ResonanceLine? {
    if (!resonance) return null
    val reaches = reachesOriginal(visibility, anonymous)
    return when {
        updating -> if (!liveReaches && reaches) ResonanceLine.Reaches else null
        reaches -> ResonanceLine.Reaches
        else -> ResonanceLine.Quiet
    }
}

/**
 * Why a verb didn't go through, in the writer's language — never the server's or the network's
 * English: a card gone (deleted elsewhere) can't be found, so trying again won't help; the day's
 * publishing used up (429 `rate_limited`) waits for tomorrow; anything else is [fallback] (didn't
 * publish, didn't save… — try again).
 */
internal fun failureText(e: Throwable?, fallback: String): String = when {
    e is ApiFailure && (e.code == "rate_limited" || e.status == 429) -> L10n.Write.PublishPanel.rateLimited
    e is ApiFailure && (e.isNotFound || e.status == 404) -> L10n.Card.NotFound.title
    else -> fallback
}

/**
 * Why the step's [verb] didn't go through, in the step's own words: [failureText] with "didn't
 * publish" for a publish and "didn't save" for anything else ([failureFallback]).
 */
internal fun publishError(e: Exception, verb: StepVerb): String = failureText(e, failureFallback(verb))

/**
 * A photo on its way up: decoded small enough, re-encoded on the device as
 * the web compresses before /api/upload, and its accent hue read from a
 * 32×32 thumbnail (lib/images/accentHue).
 */
object CoverImage {
    private const val MAX_SIDE = 2048

    /** A software bitmap (its pixels are read) at most 2048px on the long side. */
    fun decode(context: Context, uri: Uri): Bitmap =
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val long = max(info.size.width, info.size.height)
            if (long > MAX_SIDE) {
                val scale = MAX_SIDE.toFloat() / long
                decoder.setTargetSize((info.size.width * scale).roundToInt(), (info.size.height * scale).roundToInt())
            }
        }

    /** JPEG at 0.85 — well under the upload's 8 MB cap. */
    fun jpeg(bitmap: Bitmap): ByteArray = ByteArrayOutputStream().use {
        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, it)
        it.toByteArray()
    }

    fun accentHue(bitmap: Bitmap): Double? {
        val thumb = Bitmap.createScaledBitmap(bitmap, 32, 32, true)
        val pixels = IntArray(32 * 32)
        thumb.getPixels(pixels, 0, 32, 0, 0, 32, 32)
        return AccentHue.of(pixels)
    }
}
