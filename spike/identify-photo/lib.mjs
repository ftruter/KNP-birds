// Shared helpers for the issue 151 spike scripts.

import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = path.dirname(fileURLToPath(import.meta.url))
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
