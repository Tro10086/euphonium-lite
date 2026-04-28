import type { ParsedFileInfo } from '@/models/File'

export interface DetailedParsedFileInfo extends ParsedFileInfo {
  episodeEnd?: number
  titleCandidates: string[]
  confidence: number
  warnings: string[]
  releaseGroup?: string
  resolution?: string
  videoCodec?: string
  audioCodec?: string
  source?: string
  subLanguages: string[]
  extraTags: string[]
  isSpecial: boolean
  tags: string[]
  normalizedName: string
  parentFolder?: string
}

type Span = [start: number, end: number]

interface NumberMatch {
  value: number
  span: Span
  end?: number
  confidence?: number
  warning?: string
}

interface EpisodeMatch {
  season: number
  episode: number
  span: Span
  episodeEnd?: number
  confidence: number
  warning?: string
}

const CN_NUM = '[\\u96f6\\u4e00\\u4e8c\\u4e24\\u5169\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341\\u767e\\u5343\\u4e07]+'
const NUMBER_TOKEN = `(?:\\d+|${CN_NUM})`
const OPEN_BRACKET = '[\\[\\u3010(\\uff08]'
const CLOSE_BRACKET = '[\\]\\u3011)\\uff09]'
const RANGE_SEP = '(?:-|~|\\uff5e|\\u81f3)'
const LEFT_BOUNDARY_CHARS = '\\s._\\-\\[\\u3010(\\uff08'
const RIGHT_BOUNDARY_CHARS = '\\s._\\-\\]\\u3011)\\uff09'
const LEFT_BOUNDARY = `(^|[${LEFT_BOUNDARY_CHARS}]|[^\\x00-\\x7f])`
const RIGHT_BOUNDARY = `(?=$|[${RIGHT_BOUNDARY_CHARS}]|[^A-Za-z0-9])`

const CHINESE_NUMBERS: Record<string, number> = {
  '\u96f6': 0,
  '\u4e00': 1,
  '\u4e8c': 2,
  '\u4e24': 2,
  '\u5169': 2,
  '\u4e09': 3,
  '\u56db': 4,
  '\u4e94': 5,
  '\u516d': 6,
  '\u4e03': 7,
  '\u516b': 8,
  '\u4e5d': 9,
}

const VIDEO_CODECS = ['AV1', 'HEVC', 'H265', 'H.265', 'X265', 'H264', 'H.264', 'X264', 'AVC', 'VP9']
const AUDIO_CODECS = ['AAC', 'FLAC', 'OPUS', 'MP3', 'AC3', 'EAC3', 'E-AC-3', 'DTS']
const SOURCES = ['WEB-DL', 'WEBRIP', 'WEB', 'BDRIP', 'BLURAY', 'BD', 'HDTV', 'TVRIP']
const VERSION_TAGS = ['V2', 'V3', 'FINAL', 'REPACK']
const SPECIAL_TAGS = ['OVA', 'OAD', 'SP', 'SPECIAL', 'NCOP', 'NCED']
const TITLE_NUMBER_BLACKLIST = ['十二国记']

export function parseDetailedVideoFileName(
  fileName: string,
  parentFolder?: string,
): DetailedParsedFileInfo {
  const normalizedName = normalizeSeparators(stripExtension(fileName))
  const spans: Span[] = []
  const warnings: string[] = []
  const tags = extractBracketTags(normalizedName)
  const metadata = extractMetadata(normalizedName)

  if (metadata.releaseGroupSpan) spans.push(metadata.releaseGroupSpan)
  spans.push(...metadata.technicalSpans)

  const episodeMatch = extractSeasonEpisode(normalizedName, spans)
  const season = episodeMatch?.season ?? 1
  const episode = episodeMatch?.episode ?? 0
  const episodeEnd = episodeMatch?.episodeEnd
  const confidence = episodeMatch?.confidence ?? 0

  if (episodeMatch) {
    spans.push(episodeMatch.span)
    if (episodeMatch.warning) warnings.push(episodeMatch.warning)
  }

  if (!episode) warnings.push('episode-not-found')
  if (episodeEnd !== undefined && episodeEnd < episode) warnings.push('episode-range-end-before-start')

  const titleCandidates = buildTitleCandidates(normalizedName, spans, parentFolder, metadata.releaseGroup)
  const title = titleCandidates[0] ?? fallbackTitle(normalizedName, parentFolder)

  return {
    title,
    season,
    episode,
    episodeEnd,
    titleCandidates,
    confidence: episode ? confidence : Math.min(confidence, 0.35),
    warnings,
    releaseGroup: metadata.releaseGroup,
    resolution: metadata.resolution,
    videoCodec: metadata.videoCodec,
    audioCodec: metadata.audioCodec,
    source: metadata.source,
    subLanguages: metadata.subLanguages,
    extraTags: metadata.extraTags,
    isSpecial: metadata.isSpecial,
    tags,
    normalizedName,
    parentFolder,
  }
}

export function parseVideoFileName(fileName: string): ParsedFileInfo {
  const parsed = parseDetailedVideoFileName(fileName)
  return {
    title: parsed.title,
    season: parsed.season,
    episode: parsed.episode,
  }
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.\\]+$/, '')
}

function normalizeSeparators(value: string): string {
  return value.replace(/\uff3f/g, '_').replace(/\uff0d/g, '-').trim()
}

function extractBracketTags(value: string): string[] {
  const pattern = new RegExp(`${OPEN_BRACKET}([^\\]\\u3011)\\uff09]+)${CLOSE_BRACKET}`, 'g')
  return Array.from(value.matchAll(pattern))
    .map((match) => match[1]?.trim())
    .filter((tag): tag is string => Boolean(tag))
}

function extractMetadata(value: string) {
  const technicalSpans: Span[] = []
  const resolution = firstMatch(value, /\b(2160p|1440p|1080p|720p|480p|4K|8K)\b/i)
  const videoCodec = firstToken(value, VIDEO_CODECS)
  const audioCodec = firstToken(value, AUDIO_CODECS)
  const source = firstToken(value, SOURCES)
  const subLanguages = extractSubLanguages(value)
  const extraTags = [...extractTokens(value, VERSION_TAGS), ...extractTokens(value, SPECIAL_TAGS)]
  const isSpecial = extractTokens(value, SPECIAL_TAGS).length > 0
  const leadingTagPattern = new RegExp(`^\\s*${OPEN_BRACKET}([^\\]\\u3011)\\uff09]+)${CLOSE_BRACKET}`)
  const leadingTag = value.match(leadingTagPattern)
  const leadingTagText = leadingTag?.[1]?.trim()
  let releaseGroup: string | undefined
  let releaseGroupSpan: Span | undefined

  if (leadingTag && leadingTagText && !isTechnicalTag(leadingTagText) && !looksLikeEpisodeTag(leadingTagText)) {
    releaseGroup = leadingTagText
    releaseGroupSpan = [leadingTag.index ?? 0, (leadingTag.index ?? 0) + leadingTag[0].length]
  }

  const tagPattern = new RegExp(`${OPEN_BRACKET}([^\\]\\u3011)\\uff09]+)${CLOSE_BRACKET}`, 'g')
  for (const match of value.matchAll(tagPattern)) {
    const tag = match[1]?.trim()
    if (tag && isTechnicalTag(tag)) {
      technicalSpans.push([match.index, match.index + match[0].length])
    }
  }

  for (const token of [resolution, videoCodec, audioCodec, source, ...extraTags]) {
    if (!token) continue
    const index = value.toLocaleLowerCase().indexOf(token.toLocaleLowerCase())
    if (index >= 0) technicalSpans.push([index, index + token.length])
  }

  return {
    releaseGroup,
    releaseGroupSpan,
    resolution,
    videoCodec,
    audioCodec,
    source,
    subLanguages,
    extraTags,
    isSpecial,
    technicalSpans,
  }
}

function extractSeasonEpisode(value: string, blockedSpans: Span[]): EpisodeMatch | undefined {
  const standard = matchSeasonEpisode(value)
  if (standard) return { ...standard, confidence: 0.98 }

  const seasonMatch = matchSeason(value)
  const season = seasonMatch?.value ?? 1

  const namedEpisode = matchNamedEpisode(value)
  if (namedEpisode) {
    return {
      season,
      episode: namedEpisode.value,
      episodeEnd: namedEpisode.end,
      span: mergeMatchSpans(seasonMatch?.span, namedEpisode.span),
      confidence: 0.92,
    }
  }

  const epEpisode = matchEpEpisode(value)
  if (epEpisode) {
    return {
      season,
      episode: epEpisode.value,
      episodeEnd: epEpisode.end,
      span: mergeMatchSpans(seasonMatch?.span, epEpisode.span),
      confidence: 0.86,
    }
  }

  const rangeEpisode = matchNumberRange(value, blockedSpans)
  if (rangeEpisode) {
    return {
      season,
      episode: rangeEpisode.value,
      episodeEnd: rangeEpisode.end,
      span: mergeMatchSpans(seasonMatch?.span, rangeEpisode.span),
      confidence: 0.7,
    }
  }

  const ordinaryEpisode = matchOrdinaryEpisode(value, blockedSpans)
  if (ordinaryEpisode) {
    return {
      season,
      episode: ordinaryEpisode.value,
      span: mergeMatchSpans(seasonMatch?.span, ordinaryEpisode.span),
      confidence: ordinaryEpisode.confidence ?? 0.6,
      warning: ordinaryEpisode.warning,
    }
  }

  if (seasonMatch) {
    return {
      season: seasonMatch.value,
      episode: 0,
      span: seasonMatch.span,
      confidence: 0.35,
    }
  }

  return undefined
}

function matchSeasonEpisode(value: string): (EpisodeMatch & { confidence?: number }) | undefined {
  const pattern = new RegExp(
    `S(?:eason)?\\s*0*(\\d{1,2})\\s*E(?:pisode)?\\s*0*(\\d{1,3})(?:\\s*${RANGE_SEP}\\s*(?:E)?0*(\\d{1,3}))?${RIGHT_BOUNDARY}`,
    'i',
  )
  const match = value.match(pattern)
  if (!match?.[1] || !match[2]) return undefined

  return {
    season: Number.parseInt(match[1], 10),
    episode: Number.parseInt(match[2], 10),
    episodeEnd: match[3] ? Number.parseInt(match[3], 10) : undefined,
    span: [match.index ?? 0, (match.index ?? 0) + match[0].length],
    confidence: 0.98,
  }
}

function matchSeason(value: string): NumberMatch | undefined {
  return (
    numberFromBoundaryMatch(value, new RegExp(`${LEFT_BOUNDARY}Season\\s*0*(\\d{1,2})${RIGHT_BOUNDARY}`, 'i')) ??
    numberFromBoundaryMatch(value, new RegExp(`${LEFT_BOUNDARY}S\\s*0*(\\d{1,2})${RIGHT_BOUNDARY}`, 'i')) ??
    numberFromMatch(value, new RegExp(`\\u7b2c\\s*(${NUMBER_TOKEN})\\s*\\u5b63`))
  )
}

function matchNamedEpisode(value: string): NumberMatch | undefined {
  const pattern = new RegExp(
    `\\u7b2c\\s*(${NUMBER_TOKEN})\\s*(?:\\u8bdd|\\u8a71|\\u96c6)(?:\\s*${RANGE_SEP}\\s*\\u7b2c?\\s*(${NUMBER_TOKEN})\\s*(?:\\u8bdd|\\u8a71|\\u96c6)?)?`,
  )
  const match = value.match(pattern)
  if (!match?.[1]) return undefined

  return {
    value: parseNumber(match[1]),
    end: match[2] ? parseNumber(match[2]) : undefined,
    span: [match.index ?? 0, (match.index ?? 0) + match[0].length],
  }
}

function matchEpEpisode(value: string): NumberMatch | undefined {
  const pattern = new RegExp(
    `${LEFT_BOUNDARY}(?:EP|Episode)\\.?\\s*0*(\\d{1,3})(?:\\s*${RANGE_SEP}\\s*(?:EP)?0*(\\d{1,3}))?${RIGHT_BOUNDARY}`,
    'i',
  )
  const match = value.match(pattern)
  if (!match?.[2]) return undefined

  const start = (match.index ?? 0) + match[1]!.length
  return {
    value: Number.parseInt(match[2], 10),
    end: match[3] ? Number.parseInt(match[3], 10) : undefined,
    span: [start, (match.index ?? 0) + match[0].length],
  }
}

function matchNumberRange(value: string, blockedSpans: Span[]): NumberMatch | undefined {
  const pattern = new RegExp(`${LEFT_BOUNDARY}0*(\\d{1,3})\\s*${RANGE_SEP}\\s*0*(\\d{1,3})${RIGHT_BOUNDARY}`, 'g')
  const matches = Array.from(value.matchAll(pattern))
    .map((match) => ({
      value: Number.parseInt(match[2]!, 10),
      end: Number.parseInt(match[3]!, 10),
      span: [(match.index ?? 0) + match[1]!.length, (match.index ?? 0) + match[0].length] as Span,
      raw: match[0],
    }))
    .filter((match) => match.value > 0 && match.value <= 200)
    .filter((match) => match.end > match.value && match.end <= 200)
    .filter((match) => !isYearLike(match.value, match.raw) && !isYearLike(match.end, match.raw))
    .filter((match) => !blockedSpans.some((span) => overlaps(span, match.span)))

  return matches.at(-1)
}

function matchOrdinaryEpisode(value: string, blockedSpans: Span[]): NumberMatch | undefined {
  const numeric = matchTrailingNumberEpisode(value, blockedSpans)
  if (numeric) return numeric

  return matchFallbackChineseNumber(value, blockedSpans)
}

function matchTrailingNumberEpisode(value: string, blockedSpans: Span[]): NumberMatch | undefined {
  const pattern = new RegExp(`${LEFT_BOUNDARY}0*(\\d{1,3})${RIGHT_BOUNDARY}`, 'g')
  const matches = Array.from(value.matchAll(pattern))
    .map((match) => ({
      value: Number.parseInt(match[2]!, 10),
      span: [(match.index ?? 0) + match[1]!.length, (match.index ?? 0) + match[0].length] as Span,
      raw: match[0],
    }))
    .filter((match) => match.value > 0 && match.value <= 200)
    .filter((match) => !isYearLike(match.value, match.raw))
    .filter((match) => !blockedSpans.some((span) => overlaps(span, match.span)))

  return matches.at(-1)
}

function matchFallbackChineseNumber(value: string, blockedSpans: Span[]): NumberMatch | undefined {
  if (TITLE_NUMBER_BLACKLIST.some((word) => value.includes(word))) return undefined

  const pattern = new RegExp(`${LEFT_BOUNDARY}(${CN_NUM})${RIGHT_BOUNDARY}`, 'g')
  const matches = Array.from(value.matchAll(pattern))
    .map((match) => ({
      value: parseNumber(match[2]!),
      span: [(match.index ?? 0) + match[1]!.length, (match.index ?? 0) + match[0].length] as Span,
      raw: match[0],
      confidence: 0.48,
      warning: 'fallback-chinese-episode-number',
    }))
    .filter((match) => match.value > 0 && match.value <= 200)
    .filter((match) => !blockedSpans.some((span) => overlaps(span, match.span)))
    .filter((match) => !isInsideBracket(value, match.span))

  return matches.at(-1)
}

function buildTitleCandidates(
  value: string,
  spans: Span[],
  parentFolder?: string,
  releaseGroup?: string,
): string[] {
  const primary = cleanTitle(removeSpans(value, spans))
  const candidates = [primary]

  for (const title of splitPossibleTitles(primary)) {
    candidates.push(title)
  }

  candidates.push(...extractBracketTitleCandidates(value, releaseGroup))

  if (parentFolder) {
    candidates.push(cleanTitle(parentFolder.replace(/[\\/]+$/g, '').split(/[\\/]/).at(-1) ?? parentFolder))
  }

  return unique(candidates.filter(Boolean))
}

function fallbackTitle(value: string, parentFolder?: string): string {
  return cleanTitle(parentFolder?.split(/[\\/]/).at(-1) ?? value) || value
}

function removeSpans(value: string, spans: Span[]): string {
  const chars = value.split('')
  for (const [start, end] of mergeSpans(spans)) {
    for (let index = start; index < end; index += 1) {
      chars[index] = ' '
    }
  }
  return chars.join('')
}

function cleanTitle(value: string): string {
  return value
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\u3010[^\u3011]*\u3011/g, ' ')
    .replace(/[()\uff08\uff09]/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s*[-\u2013\u2014]+\s*$/g, ' ')
    .replace(/^\s*[-\u2013\u2014]+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitPossibleTitles(value: string): string[] {
  return value
    .split(/\s+-\s+| - |\uff0f|\//)
    .map(cleanTitle)
    .filter((part) => part.length >= 2)
}

function extractBracketTitleCandidates(value: string, releaseGroup?: string): string[] {
  const pattern = new RegExp(`${OPEN_BRACKET}([^\\]\\u3011)\\uff09]+)${CLOSE_BRACKET}`, 'g')
  return Array.from(value.matchAll(pattern))
    .map((match) => match[1]?.trim() ?? '')
    .filter((tag) => tag && tag !== releaseGroup)
    .filter((tag) => !isTechnicalTag(tag) && !looksLikeEpisodeTag(tag))
    .map(cleanTitle)
    .filter((tag) => tag.length >= 2)
}

function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  const merged: Span[] = []

  for (const span of sorted) {
    const last = merged.at(-1)
    if (!last || span[0] > last[1]) {
      merged.push([...span])
    } else {
      last[1] = Math.max(last[1], span[1])
    }
  }

  return merged
}

function mergeMatchSpans(a: Span | undefined, b: Span): Span {
  if (!a) return b
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])]
}

function numberFromMatch(value: string, pattern: RegExp): NumberMatch | undefined {
  const match = value.match(pattern)
  if (!match?.[1]) return undefined

  return {
    value: parseNumber(match[1]),
    span: [match.index ?? 0, (match.index ?? 0) + match[0].length],
  }
}

function numberFromBoundaryMatch(value: string, pattern: RegExp): NumberMatch | undefined {
  const match = value.match(pattern)
  if (!match?.[2]) return undefined

  const start = (match.index ?? 0) + match[1]!.length
  return {
    value: parseNumber(match[2]),
    span: [start, (match.index ?? 0) + match[0].length],
  }
}

function parseNumber(value: string): number {
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10)

  let total = 0
  let section = 0
  for (const char of value) {
    if (char === '\u4e07') {
      total += (section || 1) * 10000
      section = 0
    } else if (char === '\u5343') {
      section = (section || 1) * 1000
      total += section
      section = 0
    } else if (char === '\u767e') {
      section = (section || 1) * 100
      total += section
      section = 0
    } else if (char === '\u5341') {
      section = (section || 1) * 10
      total += section
      section = 0
    } else {
      section = CHINESE_NUMBERS[char] ?? section
    }
  }

  return total + section
}

function firstMatch(value: string, pattern: RegExp): string | undefined {
  return value.match(pattern)?.[1]
}

function firstToken(value: string, tokens: string[]): string | undefined {
  const lowerValue = value.toLocaleLowerCase()
  return tokens.find((token) => lowerValue.includes(token.toLocaleLowerCase()))
}

function extractTokens(value: string, tokens: string[]): string[] {
  const lowerValue = value.toLocaleLowerCase()
  return tokens.filter((token) => lowerValue.includes(token.toLocaleLowerCase()))
}

function extractSubLanguages(value: string): string[] {
  const languages: string[] = []
  if (/简|CHS|GB/i.test(value)) languages.push('简')
  if (/繁|CHT|BIG5/i.test(value)) languages.push('繁')
  if (/日(?!剧)|JPN|JP/i.test(value)) languages.push('日')
  return unique(languages)
}

function isTechnicalTag(tag: string): boolean {
  return (
    /\b(2160p|1440p|1080p|720p|480p|4K|8K)\b/i.test(tag) ||
    VIDEO_CODECS.some((token) => tag.toLocaleLowerCase().includes(token.toLocaleLowerCase())) ||
    AUDIO_CODECS.some((token) => tag.toLocaleLowerCase().includes(token.toLocaleLowerCase())) ||
    SOURCES.some((token) => tag.toLocaleLowerCase().includes(token.toLocaleLowerCase())) ||
    /\b(?:MP4|MKV|MOV|AVI)\b/i.test(tag) ||
    VERSION_TAGS.some((token) => tag.toLocaleLowerCase() === token.toLocaleLowerCase()) ||
    SPECIAL_TAGS.some((token) => tag.toLocaleLowerCase() === token.toLocaleLowerCase()) ||
    /\b(?:CHS|CHT|BIG5|GB)\b/i.test(tag) ||
    /(?:\u7b80|\u7e41|\u5185\u5c01|\u5916\u6302|\u5b57\u5e55(?!\u793e))/.test(tag)
  )
}

function looksLikeEpisodeTag(tag: string): boolean {
  return /^(?:EP|Episode)?\s*\d{1,3}$/i.test(tag) || new RegExp(`^\\u7b2c.+(?:\\u8bdd|\\u8a71|\\u96c6)$`).test(tag)
}

function isYearLike(value: number, raw: string): boolean {
  return value >= 1900 || /\d{4}/.test(raw)
}

function isInsideBracket(value: string, span: Span): boolean {
  const left = value.slice(0, span[0])
  const right = value.slice(span[1])
  const lastOpen = Math.max(left.lastIndexOf('['), left.lastIndexOf('【'), left.lastIndexOf('('), left.lastIndexOf('（'))
  const lastClose = Math.max(left.lastIndexOf(']'), left.lastIndexOf('】'), left.lastIndexOf(')'), left.lastIndexOf('）'))
  if (lastOpen <= lastClose) return false

  const nextCloseCandidates = [right.indexOf(']'), right.indexOf('】'), right.indexOf(')'), right.indexOf('）')].filter(
    (index) => index >= 0,
  )
  return nextCloseCandidates.length > 0
}

function overlaps(a: Span, b: Span): boolean {
  return a[0] < b[1] && b[0] < a[1]
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}
