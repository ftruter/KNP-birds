/**
 * IndexNow (https://www.indexnow.org) lets a site tell Bing, Yandex and the
 * other member search engines which URLs changed. The key is public by
 * design: an engine checks that the site serves it at /<key>.txt before it
 * accepts a submission. scripts/indexnow.mjs submits after a deploy.
 */
export const INDEXNOW_KEY = '09294dd88a5909a1d137569fd3636944'
export const INDEXNOW_KEY_PATH = `/${INDEXNOW_KEY}.txt`
