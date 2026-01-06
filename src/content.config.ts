import { glob } from 'astro/loaders'
import { defineCollection, z } from 'astro:content'
import { ObsidianDocumentSchema, ObsidianMdLoader } from "astro-loader-obsidian";

function removeDupsAndLowerCase(array: string[]) {
  if (!array.length) return array
  const lowercaseItems = array.map((str) => str.toLowerCase())
  const distinctItems = new Set(lowercaseItems)
  return Array.from(distinctItems)
}

// Define blog collection
const blog = defineCollection({
  // Load Markdown and MDX files in the `src/content/blog/` directory.
  loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
  // Required
  schema: ({ image }) =>
    z.object({
      // Required
      title: z.string().max(60),
      description: z.string().max(160),
      publishDate: z.coerce.date(),
      // Optional
      updatedDate: z.coerce.date().optional(),
      heroImage: z
        .object({
          src: image(),
          alt: z.string().optional(),
          inferSize: z.boolean().optional(),
          width: z.number().optional(),
          height: z.number().optional(),

          color: z.string().optional()
        })
        .optional(),
      tags: z.array(z.string()).default([]).transform(removeDupsAndLowerCase),
      language: z.string().optional(),
      draft: z.boolean().default(false),
      // Special fields
      comment: z.boolean().default(true)
    })
})

// Define vault collection
const vault = defineCollection({
  loader: ObsidianMdLoader({
    base: 'src/content/vault',
    url: 'vault',
    // Transform tag references in body into links
    parseTagsIntoLinks: true,
    // Additional fields to parse as wikilinks if needed
    wikilinkFields: ['description'],
    // Broken links strategy: warn, label, or 404
    brokenLinksStrategy: 'warn',
  }),
  schema: ({ image }) =>
    ObsidianDocumentSchema.extend({
      title: z.string().optional(),
      publishDate: z.coerce.date().optional(),
      updatedDate: z.coerce.date().optional(),
      description: z.union([z.string(), z.record(z.any())]).optional().transform(val => 
        typeof val === 'string' ? val : undefined
      ),
      heroImage: z
        .object({
          src: image(),
          alt: z.string().optional(),
          inferSize: z.boolean().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
          color: z.string().optional()
        })
        .optional(),
      tags: z.array(z.string()).default([]).transform(removeDupsAndLowerCase).optional(),
      draft: z.boolean().default(false).optional(),
      order: z.number().default(999).optional()
    })
})

export const collections = { blog, vault }
