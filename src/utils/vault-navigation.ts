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
  indexDoc?: VaultNode
  folders: FolderNode[]
  vault: VaultNode[]
}

type FolderBuilder = {
  id: string
  path: string
  title: string
  orderHint: number
  indexDoc?: VaultNode
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
    indexDoc: undefined,
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
    indexDoc: folder.indexDoc,
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

  // First pass: Create all folder structures
  for (const doc of vaultCollection) {
    const docOrder = doc.data.order ?? ORDER_FALLBACK
    const docPath = doc.id
    const segments = docPath.split('/')
    
    // Don't create a folder for the last segment (the filename)
    const folderSegments = segments.slice(0, -1)

    let currentFolder = rootFolder
    const currentSegments: string[] = []

    // Create folder hierarchy for this document's path
    for (const segment of folderSegments) {
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
  }

  // Helper function to find folder by path
  const findFolderByPath = (path: string): FolderBuilder | null => {
    const segments = path.split('/')
    let current = rootFolder
    
    for (const segment of segments) {
      if (!current.folders.has(segment)) {
        return null
      }
      current = current.folders.get(segment)!
    }
    
    return current
  }

  // Second pass: Assign documents to folders or as index docs
  for (const doc of vaultCollection) {
    const docOrder = doc.data.order ?? ORDER_FALLBACK
    const docPath = doc.id
    const title = doc.data.title ?? toTitleCase(doc.id)

    const segments = docPath.split('/')
    const fileName = segments.pop()

    if (!fileName) continue

    // Navigate to the parent folder
    let currentFolder = rootFolder
    for (const segment of segments) {
      const nextFolder = currentFolder.folders.get(segment)
      if (!nextFolder) {
        console.warn(`[vault-navigation] Folder not found: ${segments.join('/')}/${fileName}`)
        break
      }
      currentFolder = nextFolder
    }

    // Check if this is an Obsidian folder note
    // ObsidianMdLoader converts "Folder/Subfolder/index.md" to ID "folder/subfolder"
    // So we check if the document's full path matches an existing folder path
    const matchingFolder = findFolderByPath(docPath)

    if (matchingFolder) {
      // This is an Obsidian folder note - assign as indexDoc to the matching folder
      matchingFolder.indexDoc = {
        id: doc.id,
        path: docPath,
        title,
        order: docOrder
      }
      matchingFolder.orderHint = Math.min(matchingFolder.orderHint, docOrder)
    } else if (fileName === 'index') {
      // Explicit index file
      currentFolder.indexDoc = {
        id: doc.id,
        path: docPath,
        title,
        order: docOrder
      }
      currentFolder.orderHint = Math.min(currentFolder.orderHint, docOrder)
    } else {
      // Regular document
      currentFolder.vault.push({
        id: doc.id,
        path: docPath,
        title,
        order: docOrder
      })
      currentFolder.orderHint = Math.min(currentFolder.orderHint, docOrder)
    }
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
  // Ensure consistent lowercase for folder matching
  return trimmed === '' ? 'index' : trimmed.toLowerCase()
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