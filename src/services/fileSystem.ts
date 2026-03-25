import { db } from '@/db/db';
import type { VideoFile } from '@/db/models';

// 授权目录
export async function requestDirectory() {
  if (!window.showDirectoryPicker) {
    throw new Error('当前浏览器不支持 File System Access API，请使用 Chrome/Edge 等浏览器');
  }
  const dirHandle = await window.showDirectoryPicker();
  // 将目录句柄存储到 IndexedDB
  await db.table('dirHandle').put({ id: 'main', handle: dirHandle });
  return dirHandle;
}

// 恢复已授权的目录句柄
export async function getDirectoryHandle() {
  const record = await db.table('dirHandle').get('main');
  if (record && record.handle) {
    // 验证权限是否仍然有效
    if (await record.handle.queryPermission({ mode: 'read' }) === 'granted') {
      return record.handle;
    }
  }
  return null;
}

// 扫描视频文件
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];

async function isVideoFile(fileHandle: FileSystemFileHandle) {
  const name = fileHandle.name;
  return VIDEO_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
}

async function scanDirectory(dirHandle: FileSystemDirectoryHandle, relativePath = ''): Promise<VideoFile[]> {
  const files: VideoFile[] = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const currentPath = relativePath ? `${relativePath}/${name}` : name;
    if (handle.kind === 'file') {
      if (await isVideoFile(handle as FileSystemFileHandle)) {
        const file = await (handle as FileSystemFileHandle).getFile();
        files.push({
          id: currentPath,  // 使用相对路径作为唯一标识（假设路径唯一）
          path: currentPath,
          name,
          ext: name.split('.').pop() || '',
          size: file.size,
          modified: file.lastModified,
          parentPath: relativePath,
        });
      }
    } else if (handle.kind === 'directory') {
      const subFiles = await scanDirectory(handle as FileSystemDirectoryHandle, currentPath);
      files.push(...subFiles);
    }
  }
  return files;
}

export async function scanVideos(dirHandle: FileSystemDirectoryHandle) {
  const files = await scanDirectory(dirHandle);
  // 存储到 IndexedDB，先清空旧数据（简单处理）
  await db.table('files').clear();
  await db.table('files').bulkAdd(files);
  return files;
}