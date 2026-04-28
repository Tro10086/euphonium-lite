import Dexie, { type Table } from 'dexie'
import {
  NOTE_SCHEMA_VERSION,
  type Attachment,
  type Note,
  type NoteTargetType,
  type TipTapJSON,
} from '@/models/Note'

export type NoteDraft = {
  id?: string
  targetType: NoteTargetType
  targetId: string
  tiptapJson: TipTapJSON
  plainText: string
  attachmentIds?: string[]
}

export type AttachmentDraft = {
  id?: string
  noteId: string
  name: string
  mimeType?: string
  blob: Blob
}

class EuphoniumNotesDB extends Dexie {
  notes!: Table<Note, string>
  attachments!: Table<Attachment, string>

  constructor() {
    super('EuphoniumLiteNotes')
    this.version(1).stores({
      notes: 'id, targetType, targetId, updated_at, [targetType+targetId]',
      attachments: 'id, noteId, name, mimeType, created_at',
    })
  }
}

export const notesDb = new EuphoniumNotesDB()

function cloneTipTapJson(json: TipTapJSON): TipTapJSON {
  return structuredClone(json)
}

function walkTipTapJson(node: TipTapJSON, visitor: (node: TipTapJSON) => TipTapJSON): TipTapJSON {
  const visited = visitor(node)
  if (!Array.isArray(visited.content)) return visited

  return {
    ...visited,
    content: visited.content.map((child) => walkTipTapJson(child, visitor)),
  }
}

export function sanitizeImageAttrs(json: TipTapJSON): TipTapJSON {
  return walkTipTapJson(cloneTipTapJson(json), (node) => {
    if (node.type !== 'image') return node

    const attrs = node.attrs ?? {}
    const cleanAttrs: Record<string, unknown> = {}
    for (const key of ['src', 'alt', 'title', 'attachmentId', 'width', 'height']) {
      const value = attrs[key]
      if (typeof value === 'string' || typeof value === 'number') cleanAttrs[key] = value
    }

    return { ...node, attrs: cleanAttrs }
  })
}

export function injectImageAttrs(
  json: TipTapJSON,
  resolver: (attachmentId: string) => Partial<Record<string, unknown>> | undefined,
): TipTapJSON {
  return walkTipTapJson(cloneTipTapJson(json), (node) => {
    if (node.type !== 'image') return node

    const attachmentId = node.attrs?.attachmentId
    if (typeof attachmentId !== 'string') return node

    const injectedAttrs = resolver(attachmentId)
    if (!injectedAttrs) return node

    return {
      ...node,
      attrs: {
        ...node.attrs,
        ...injectedAttrs,
        attachmentId,
      },
    }
  })
}

export const notesAPI = {
  async save(draft: NoteDraft): Promise<string> {
    const now = new Date()
    const existing = draft.id ? await notesDb.notes.get(draft.id) : undefined
    const id = draft.id ?? crypto.randomUUID()
    const note: Note = {
      id,
      schemaVersion: NOTE_SCHEMA_VERSION,
      targetType: draft.targetType,
      targetId: draft.targetId,
      tiptapJson: sanitizeImageAttrs(draft.tiptapJson),
      plainText: draft.plainText,
      attachmentIds: draft.attachmentIds ?? existing?.attachmentIds ?? [],
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }

    await notesDb.notes.put(note)
    return id
  },

  async getById(id: string) {
    return notesDb.notes.get(id)
  },

  async getByTarget(targetType: NoteTargetType, targetId: string) {
    return notesDb.notes.where('[targetType+targetId]').equals([targetType, targetId]).toArray()
  },

  async getAll() {
    return notesDb.notes.toArray()
  },

  async bulkPut(notes: Note[]) {
    if (notes.length === 0) return
    await notesDb.notes.bulkPut(notes)
  },

  async delete(id: string) {
    await notesDb.transaction('rw', [notesDb.notes, notesDb.attachments], async () => {
      await notesDb.attachments.where('noteId').equals(id).delete()
      await notesDb.notes.delete(id)
    })
  },
}

export const attachmentAPI = {
  async put(draft: AttachmentDraft): Promise<string> {
    const id = draft.id ?? crypto.randomUUID()
    const attachment: Attachment = {
      id,
      schemaVersion: NOTE_SCHEMA_VERSION,
      noteId: draft.noteId,
      name: draft.name,
      mimeType: draft.mimeType ?? (draft.blob.type || 'application/octet-stream'),
      size: draft.blob.size,
      blob: draft.blob,
      created_at: new Date(),
    }

    await notesDb.transaction('rw', [notesDb.attachments, notesDb.notes], async () => {
      await notesDb.attachments.put(attachment)
      const note = await notesDb.notes.get(draft.noteId)
      if (note && !note.attachmentIds.includes(id)) {
        await notesDb.notes.update(note.id, {
          attachmentIds: [...note.attachmentIds, id],
          updated_at: new Date(),
        })
      }
    })

    return id
  },

  async get(id: string) {
    return notesDb.attachments.get(id)
  },

  async getBlob(id: string) {
    return (await notesDb.attachments.get(id))?.blob
  },

  async getByNoteId(noteId: string) {
    return notesDb.attachments.where('noteId').equals(noteId).toArray()
  },

  async getAllMetadata() {
    const attachments = await notesDb.attachments.toArray()
    return attachments.map((attachment) => ({
      id: attachment.id,
      schemaVersion: attachment.schemaVersion,
      noteId: attachment.noteId,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      created_at: attachment.created_at,
    }))
  },

  async delete(id: string) {
    const attachment = await notesDb.attachments.get(id)
    await notesDb.transaction('rw', [notesDb.attachments, notesDb.notes], async () => {
      await notesDb.attachments.delete(id)
      if (attachment) {
        const note = await notesDb.notes.get(attachment.noteId)
        if (note) {
          await notesDb.notes.update(note.id, {
            attachmentIds: note.attachmentIds.filter((attachmentId) => attachmentId !== id),
            updated_at: new Date(),
          })
        }
      }
    })
  },
}
