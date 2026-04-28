import { db } from '@/db/db'
import type { VideoFile } from '@/models/File'

export class PlaybackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlaybackError'
  }
}

async function getRootHandle(file: VideoFile): Promise<FileSystemDirectoryHandle> {
  const rootId = file.root_id || 'main'
  const root = await db.libraryRoots.get(rootId)
  const record = root ? { handle: root.handle } : await db.dirHandle.get(rootId)

  if (!record?.handle) {
    throw new PlaybackError('找不到已授权的媒体目录，请重新选择本地媒体库。')
  }

  const permission = await record.handle.queryPermission({ mode: 'read' })
  if (permission === 'granted') return record.handle

  const requested = await record.handle.requestPermission({ mode: 'read' })
  if (requested !== 'granted') {
    throw new PlaybackError('本地媒体目录权限已失效，请重新授权后再播放。')
  }

  return record.handle
}

async function getFileFromRoot(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<File> {
  const parts = relativePath.split(/[\\/]+/).filter(Boolean)
  const fileName = parts.pop()

  if (!fileName) {
    throw new PlaybackError('视频文件路径无效，无法打开本地文件。')
  }

  try {
    let current = rootHandle
    for (const part of parts) {
      current = await current.getDirectoryHandle(part)
    }

    const fileHandle = await current.getFileHandle(fileName)
    return fileHandle.getFile()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      throw new PlaybackError('本地视频文件不存在，可能已被移动或删除。')
    }
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new PlaybackError('没有权限读取本地视频文件，请重新授权媒体目录。')
    }
    throw new PlaybackError(
      `打开本地视频失败：${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function createPlaybackUrl(videoFile: VideoFile): Promise<string> {
  const rootHandle = await getRootHandle(videoFile)
  const file = await getFileFromRoot(rootHandle, videoFile.path)
  return URL.createObjectURL(file)
}

export function revokePlaybackUrl(url?: string | null) {
  if (url) URL.revokeObjectURL(url)
}
