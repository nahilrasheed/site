import type { CollectionEntry } from 'astro:content'

const ORDER_FALLBACK = 1_000_000

export type VaultNode = {
  id: string
  path: string
  title: string
  order: number
}

export type FolderNode = {
  id: string
  path: string
  title: string
  orderHint: number
  folders: FolderNode[]
  vault: VaultNode[]
}

type FolderBuilder = {
  id: string
  path: string
  title: string
  orderHint: number
  folders: Map<string, FolderBuilder>
  vault: VaultNode[]
}

type BuildOptions = {
  folderTitleMap?: Record<string, string>
}

function toTitleCase(segment: string) {
  return segment
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function createFolder(id: string, path: string, title: string, orderHint: number): FolderBuilder {
  return {
    id,
    path,
    title,
    orderHint,
    folders: new Map<string, FolderBuilder>(),
    vault: []
  }
}

function normalizeFolder(folder: FolderBuilder): FolderNode {
  const folders = Array.from(folder.folders.values())
    .map(normalizeFolder)
    .sort((a, b) => {
      const orderDiff = (a.orderHint ?? ORDER_FALLBACK) - (b.orderHint ?? ORDER_FALLBACK)
      if (orderDiff !== 0) return orderDiff
      return a.title.localeCompare(b.title)
    })

  const vault = [...folder.vault].sort((a, b) => {
    const orderDiff = (a.order ?? ORDER_FALLBACK) - (b.order ?? ORDER_FALLBACK)
    if (orderDiff !== 0) return orderDiff
    return a.title.localeCompare(b.title)
  })

  return {
    id: folder.id,
    path: folder.path,
    title: folder.title,
    orderHint: folder.orderHint,
    folders,
    vault
  }
}

export function buildVaultTree(
  vaultCollection: CollectionEntry<'vault'>[],
  options: BuildOptions = {}
) {
  const { folderTitleMap = {} } = options

  const rootFolder: FolderBuilder = createFolder('root', '', '', ORDER_FALLBACK)

  for (const doc of vaultCollection) {
    const docOrder = doc.data.order ?? ORDER_FALLBACK
    // ObsidianMdLoader IDs don't include extensions, so no need to remove them
    const docPath = doc.id

    const segments = docPath.split('/')
    const fileName = segments.pop()

    if (!fileName) continue

    let currentFolder = rootFolder
    const currentSegments: string[] = []

    for (const segment of segments) {
      currentSegments.push(segment)
      const folderPath = currentSegments.join('/')

      if (!currentFolder.folders.has(segment)) {
        const title = folderTitleMap[segment] ?? toTitleCase(segment)
        currentFolder.folders.set(segment, createFolder(segment, folderPath, title, docOrder))
      }

      const existingFolder = currentFolder.folders.get(segment)!
      existingFolder.orderHint = Math.min(existingFolder.orderHint, docOrder)
      currentFolder = existingFolder
    }

    // ObsidianMdLoader auto-generates title from filename
    const title = doc.data.title ?? toTitleCase(doc.id)

    currentFolder.vault.push({
      id: doc.id,
      path: docPath,
      title,
      order: docOrder
    })
    currentFolder.orderHint = Math.min(currentFolder.orderHint, docOrder)
  }

  const vaultTree = normalizeFolder(rootFolder)
  const { folders, vault } = vaultTree

  return {
    folders,
    rootVault: vault
  }
}

/**
 * Normalize active path for matching against document paths
 */
export function normalizeActivePath(value?: string): string | undefined {
  if (!value) return undefined
  const trimmed = value.replace(/^\/vault\/?/, '').replace(/\/$/, '')
  return trimmed === '' ? 'index' : trimmed
}

/**
 * Check if a document path matches the active path
 */
export function isActiveDoc(docPath: string, activePath?: string): boolean {
  if (!activePath) return false
  if (docPath === activePath) return true
  if (docPath === `${activePath}/index`) return true
  if (activePath === `${docPath}/index`) return true
  return false
}

/**
 * Check if a folder contains the active document
 */
export function folderContainsActive(folder: FolderNode, activePath?: string): boolean {
  if (!activePath) return false

  if (folder.path) {
    if (activePath === folder.path) return true
    if (activePath === `${folder.path}/index`) return true
    if (activePath.startsWith(`${folder.path}/`)) return true
  }

  if (folder.vault.some((doc) => isActiveDoc(doc.path, activePath))) return true

  return folder.folders.some((child) => folderContainsActive(child, activePath))
}