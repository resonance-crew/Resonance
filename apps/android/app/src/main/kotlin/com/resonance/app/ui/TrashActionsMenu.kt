package com.resonance.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.resonance.design.LocalToasts
import com.resonance.design.MenuTrigger
import com.resonance.design.OrganicConfirmDialog
import com.resonance.design.OrganicMenu
import com.resonance.design.OrganicMenuItem
import com.resonance.design.Toasts
import com.resonance.design.fade
import com.resonance.design.generated.IconName
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException

/** What a 永久刪除 came to: gone; refused because the card was restored meanwhile (it stays, and is shown where it is); or failed. */
internal enum class DeleteForever { Deleted, NotInTrash, Failed }

/** The outcome of a 永久刪除 that threw [e] (null: it went through). */
internal fun deleteForeverOutcome(e: Throwable?): DeleteForever = when {
    e == null -> DeleteForever.Deleted
    e is ApiFailure && e.isNotInTrash -> DeleteForever.NotInTrash
    else -> DeleteForever.Failed
}

/**
 * 永久刪除, asked first in red (it can't be undone): 永久刪除這張卡片？ · 刪除後無法復原，卡片的故事與共振連結
 * 都會消失 · 先留著 | 永久刪除. Gone, it says 已永久刪除 and [onDeleted] runs; restored meanwhile on
 * another device (the server's 409), the question closes and says 這張卡片已經不在垃圾桶裡; any other
 * failure is said in the question, which stays for another try.
 */
@Composable
internal fun DeleteForeverDialog(trash: TrashCenter, toasts: Toasts, card: TrashRef, seed: Double, onClose: () -> Unit, onDeleted: () -> Unit = {}) {
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    OrganicConfirmDialog(
        title = L10n.Me.Actions.deleteForeverConfirmTitle,
        body = L10n.Me.Actions.deleteConfirmBody,
        cancelLabel = L10n.Me.Actions.deleteCancel,
        confirmLabel = L10n.Me.Actions.deleteForever,
        onCancel = onClose,
        onConfirm = {
            if (!busy) {
                busy = true
                failed = false
                trash.launch {
                    val error = try {
                        deleteForever(card)
                        null
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        e
                    }
                    busy = false
                    when (deleteForeverOutcome(error)) {
                        DeleteForever.Deleted -> {
                            onClose()
                            toasts.show(L10n.Me.Actions.deletedForever)
                            onDeleted()
                        }
                        DeleteForever.NotInTrash -> {
                            onClose()
                            toasts.show(L10n.Me.Actions.notInTrash)
                        }
                        DeleteForever.Failed -> failed = true
                    }
                }
            }
        },
        busy = busy,
        seed = seed,
        error = if (failed) L10n.Safety.actionError else null,
        destructive = true,
    )
}

/**
 * The ⋯ on a card in the trash (TrashActionsMenu.tsx): 還原 — it comes back as it was, saying who reads
 * it now (已還原為私人卡 / 公開卡片 / …: [restoredToast]; for a resonance that came back on its own, the
 * shell's notice) — and 永久刪除, asked first in
 * red ([DeleteForeverDialog]), sent only while the card is still in the trash (`onlyIfTrashed`).
 */
@Composable
fun TrashActionsMenu(
    card: TrashRef,
    seed: Double = 7.0,
    hue: Double? = null,
    trigger: MenuTrigger = MenuTrigger.Chip,
) {
    val trash = LocalTrash.current ?: return
    val toasts = LocalToasts.current
    var restoring by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val items = listOf(
        OrganicMenuItem(L10n.Me.Actions.restore, IconName.Restore) {
            if (restoring) return@OrganicMenuItem
            restoring = true
            // In the shell's scope: the card leaves the shelf as it comes back, and its word — who reads it now — still comes.
            trash.launch {
                try {
                    restoreSaying(card, sayWho = true)
                } finally {
                    restoring = false
                }
            }
        },
        OrganicMenuItem(L10n.Me.Actions.deleteForever, IconName.Trash, destructive = true) { deleting = true },
    )
    Box(Modifier.fade(if (restoring) 0.6f else 1f)) {
        OrganicMenu(items, L10n.Me.Actions.menuLabel, seed, hue = hue, trigger = trigger, enabled = !restoring)
    }
    if (deleting) DeleteForeverDialog(trash, toasts, card, seed + 5, onClose = { deleting = false })
}
