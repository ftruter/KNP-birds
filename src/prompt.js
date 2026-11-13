/**
 * The prompt a visitor pastes into their own chat AI (Claude, ChatGPT, Grok,
 * Gemini) so it can answer questions from this guide. One text, shared by the
 * HTML, Markdown and JSON forms of /ask-ai.
 *
 * Every URL is written out in full. Several chat AIs open only a URL they
 * have seen in the chat or in a page they already fetched, so "build the URL
 * yourself" instructions and relative links fail for them.
 */
import { siteOrigin } from './head.js'

export const ASK_AI_PATH = '/ask-ai'

export const ASK_AI_TITLE = 'Ask your AI about Kruger birds'

export const ASK_AI_INTRO =
  'Paste this prompt into your favourite AI (Claude, ChatGPT, Grok, Gemini or another) to talk to it about the birds of Kruger National Park. The AI reads this guide and searches it for you.'

export const ASK_AI_EXPECT = [
  'The AI must be able to open web pages. If it says it cannot, turn on web browsing or web search in its settings and paste the prompt again.',
  'It answers from this guide first and links the pages it used. Where the guide has no answer, it uses what else it knows and says so.',
  'The guide has no locations inside the park, no wingspan and no weight yet, so answers about those come from the AI, not from the guide.',
  'An AI can be wrong. Follow its links to check anything that matters.',
]

export const ASK_AI_EXAMPLES = [
  'Tell me five rare facts about some birds.',
  'Which is the largest flying bird?',
  'Which species has the most intricate song?',
  'Which part of the park should I go to for the best chance of seeing vultures?',
  'Roughly how many flightless birds are there?',
]

export const aiPrompt = (origin) => promptText(siteOrigin(origin))

const promptText = (
  origin,
) => `You are my guide to the birds of Kruger National Park (KNP), South Africa. Every question I ask in this chat is about birds in Kruger, even when I don't say so.

First open ${origin}/.md and follow what it says. It is an open field guide to Kruger's birds and it explains how to search it.

To look something up, open ${origin}/search.md?q=WORDS with one or two keywords in place of WORDS. A bird or family name works best, for example ${origin}/search.md?q=vulture . Then open the species pages it links to. The full lists are ${origin}/species.md and ${origin}/families.md .

Answer from the guide first and link the pages you used. If the guide does not cover something, use what else you know and say plainly which parts are not from the guide. Population figures are rough estimates: give the range and its year.

If you cannot open web pages, tell me now so I can turn on web browsing.

Start by reading the guide, then tell me in two sentences what you can help with.`

/** What the home page Markdown tells an AI about answering from the guide. */
export const answeringMarkdown = (origin) => answeringText(siteOrigin(origin))

const answeringText = (origin) => `## Answering questions from this guide

A reader may have pasted the prompt from ${origin}${ASK_AI_PATH} and be asking you about these birds. Treat every question as being about Kruger National Park.

- Search: ${origin}/search.md?q=WORDS, with one or two keywords in place of WORDS. Example: ${origin}/search.md?q=vulture
- Search matches words, not meaning. A bird name (English, Afrikaans or Latin) or a family name works best. A whole sentence does not. It returns at most 50 results, each linking to a species or family page.
- If you cannot open a search address, use the full lists instead: ${origin}/species.md (every species) and ${origin}/families.md (every family). Both link to every page.
- A species page gives the summary, status, months present, body length, habitat, field marks, calls and an approximate Kruger population. Give population figures as a range with their year.
- The guide does not hold locations inside the park, wingspan, weight or a ranking of songs. For those, answer from what else you know and say plainly that the answer is not from this guide.
- Link the pages you used.`
