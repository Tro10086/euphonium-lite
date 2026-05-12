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
    this.version(2).stores({
      notes: 'id, targetType, targetId, updated_at, deleted_at, [targetType+targetId]',
      attachments: 'id, noteId, name, mimeType, created_at',
    })
  }
}

export const notesDb = new EuphoniumNotesDB()

function cloneTipTapJson(json: TipTapJSON): TipTapJSON {
  return JSON.parse(JSON.stringify(json ?? {})) as TipTapJSON
}

function cloneStringArray(values: string[] | undefined): string[] {
  return Array.from(values ?? []).filter((value): value is string => typeof value === 'string')
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
      attachmentIds: cloneStringArray(draft.attachmentIds ?? existing?.attachmentIds),
      created_at: existing?.created_at ?? now,
      updated_at: now,
      deleted_at: existing?.deleted_at ?? null,
    }

    await notesDb.notes.put(note)
    return id
  },

  async getById(id: string) {
    return notesDb.notes.get(id)
  },

  async getByTarget(
    targetType: NoteTargetType,
    targetId: string,
    options: { includeDeleted?: boolean } = {},
  ) {
    const notes = await notesDb.notes
      .where('[targetType+targetId]')
      .equals([targetType, targetId])
      .toArray()
    if (options.includeDeleted) return notes
    return notes.filter((note) => !note.deleted_at)
  },

  async getAll() {
    return notesDb.notes.toArray()
  },

  async getAllActive() {
    const notes = await notesDb.notes.toArray()
    return notes.filter((note) => !note.deleted_at)
  },

  async bulkPut(notes: Note[]) {
    if (notes.length === 0) return
    await notesDb.notes.bulkPut(notes)
  },

  async softDelete(id: string) {
    await notesDb.notes.update(id, {
      deleted_at: new Date(),
      updated_at: new Date(),
    })
  },

  async restore(id: string) {
    await notesDb.notes.update(id, {
      deleted_at: null,
      updated_at: new Date(),
    })
  },

  async deletePermanently(id: string) {
    await notesDb.transaction('rw', [notesDb.notes, notesDb.attachments], async () => {
      await notesDb.attachments.where('noteId').equals(id).delete()
      await notesDb.notes.delete(id)
    })
  },

  async delete(id: string) {
    await this.softDelete(id)
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

    await notesDb.attachments.put(attachment)

    return id
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

  async getByIds(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
    if (uniqueIds.length === 0) return []
    return notesDb.attachments.where('id').anyOf(uniqueIds).toArray()
  },

  async getByNoteId(noteId: string) {
    return notesDb.attachments.where('noteId').equals(noteId).toArray()
  },
}
