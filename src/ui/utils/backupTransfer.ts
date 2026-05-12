import { createExportJson, importExportData, createExportZip, importNoteZip } from '@/services/exportData'
import type { ImportMergeResult } from '@/models/Note'

export function formatImporZiptResult(result: { imported: number; skipped: number; errors: string[] }) {
  const imported = result.imported
  const skipped = result.skipped
  return `导入完成：${imported}条笔记${skipped ? `，跳过 ${skipped}条；` : ''}`
}

export async function importBackupZipFile(file: File) {
  const result = await importNoteZip(file)
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('\n') || '导入失败')
  }
  return result
}

export async function downloadNoteZip() {
  const blob = await createExportZip()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `notes-export-${date}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function formatImportResult(result: ImportMergeResult) {
  const merged = result.merged
  const skipped = result.skipped
  const parts = [
    `番剧 ${merged.anime ?? 0}`,
    `剧集 ${merged.episodes ?? 0}`,
    `文件 ${merged.files ?? 0}`,
    `匹配 ${merged.matches ?? 0}`,
    `笔记 ${merged.notes ?? 0}`,
  ]
  const skippedCount = Object.values(skipped).reduce((sum, value) => sum + (value ?? 0), 0)
  return `导入完成：${parts.join('，')}${skippedCount ? `；跳过 ${skippedCount}；` : ''}`
}

export async function importBackupJsonFile(file: File) {
  const text = await file.text()
  const result = await importExportData(text, { dryRun: false, conflictStrategy: 'overwrite' })
  if (!result.ok) {
    throw new Error(result.errors.join('\n') || '导入失败')
  }
  return result
}

export async function downloadBackupJson() {
  const json = await createExportJson()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'euphonium_backup.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function reloadAfterImport(delay = 800) {
  window.setTimeout(() => window.location.reload(), delay)
}
