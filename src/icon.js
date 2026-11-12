import { clientVersion } from './client.js'
import { iconLinks } from './head.js'
import { faviconSvg, iconBase64 } from './icons.generated.js'

const bytes = (base64) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))

const contentType = (path) =>
  path.endsWith('.ico') ? 'image/x-icon' : 'image/png'

/** Path to `{ body, contentType }` for every size of the site icon. */
export const iconFiles = {
  '/favicon.svg': {
    body: new TextEncoder().encode(faviconSvg),
    contentType: 'image/svg+xml',
  },
  ...Object.fromEntries(
    Object.entries(iconBase64).map(([path, base64]) => [
      path,
      { body: bytes(base64), contentType: contentType(path) },
    ]),
  ),
}

/** Changes when the drawing does, so a cached icon is not kept past a redesign. */
export const iconVersion = clientVersion(
  faviconSvg + Object.values(iconBase64).join(''),
)

export const ICON_LINKS = iconLinks(iconVersion)
