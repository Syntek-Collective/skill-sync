/*

    COUNTERFACTUAL VARIANTS

    What this file does:
    Builds matched copies of ONE resume that are identical except for one demographic proxy,
    for the bias audit (biasAudit.ts). If the scorer gives the copies different scores, the
    difference can only come from that proxy.
      - buildVariants(resumeText, attribute) - the variants, reference group first

    The proxies (ProxyAttribute):
    - name_gender     "Name: <first> <last>" header with a female- vs male-coded first name
                      (replaces a "Name:" line, or a first line that looks like a person's name)
    - name_ethnicity  same, with a White- vs Black-coded first name
    - pronouns        he/him/his <-> she/her/hers <-> they/them/their
    - graduation_year education years (Education section or degree lines) shifted 20 years earlier, as an age proxy

    Notes:
    - pure and deterministic: the same text and attribute always give the same variants
    - the FIRST variant is the reference (baseline); biasAudit compares every other variant to it,
      so delta = variant - baseline (e.g. Black-coded minus White-coded, as in the audit literature)
    - returns [] when the proxy can't be applied (empty resume, no pronouns, no degree years)
    - this only makes the variants; it does no redaction. biasAudit redacts FIRST and builds the
      variants from the redacted text, so the name header added here is never touched by redaction.

*/

export type ProxyAttribute = 'name_gender' | 'name_ethnicity' | 'pronouns' | 'graduation_year'
export type Variant = { label: string; text: string }

export function buildVariants(resumeText: string, attribute: ProxyAttribute): Variant[] {
    if (!resumeText.trim()) return []

    switch (attribute) {
        case 'name_gender':
            return nameGenderVariants(resumeText)
        case 'name_ethnicity':
            return nameEthnicityVariants(resumeText)
        case 'pronouns':
            return pronounVariants(resumeText)
        case 'graduation_year':
            return graduationYearVariants(resumeText)
        default:
            return []
    }
}


// ===== NAMES =====
// First names from the classic résumé audit study: Bertrand & Mullainathan (2004),
// "Are Emily and Greg More Employable Than Lakisha and Jamal?", American Economic Review 94(4).
// They picked names that were both very frequent in one group and rare in the other in
// Massachusetts birth records, and checked them with a perception survey. Later audit studies
// (e.g. Kline, Rose & Walters 2022) reuse the same approach. These names are SIGNALS a scorer
// might react to, not claims about any real person.
//
// Every variant of a resume uses the SAME surname (a common one shared across groups in the
// US Census surname list), so only the first name changes.
// Which name from each list is used is picked from a hash of the resume text: deterministic,
// but different resumes get different names, so no single name's quirks drive the result.

export const NAME_LISTS = {
    whiteFemale: ['Emily', 'Anne', 'Jill', 'Allison', 'Laurie', 'Sarah', 'Meredith', 'Carrie', 'Kristen'],
    whiteMale: ['Greg', 'Brendan', 'Geoffrey', 'Brett', 'Todd', 'Matthew', 'Jay', 'Neil'],
    blackFemale: ['Lakisha', 'Tamika', 'Aisha', 'Keisha', 'Tanisha', 'Latoya', 'Kenya', 'Latonya', 'Ebony'],
    blackMale: ['Jamal', 'Darnell', 'Hakim', 'Jermaine', 'Kareem', 'Leroy', 'Rasheed', 'Tremayne', 'Tyrone'],
} as const

//a common US surname shared across groups, so the surname carries no extra signal
export const SHARED_SURNAME = 'Johnson'

//a first line like "Name: Jane Doe" is replaced; otherwise a header is added on top
const NAME_HEADER = /^[ \t]*name[ \t]*:[^\n]*(\r?\n|$)/i

//a first line that looks like the candidate's own name ("Jane Doe", "Mary-Ann O'Neil"): 2-4
//capitalised words of letters, hyphens and apostrophes only (so no digits, no @), under 40
//characters. Redaction keeps names, so without this the variant would carry two names.
const PERSON_NAME_LINE = /^\p{Lu}[\p{L}'’-]*(?:[ \t]+\p{Lu}[\p{L}'’-]*){1,3}$/u

//words that make a capitalised first line a job title or heading ("Software Engineer",
//"Professional Summary"), not a name, so it's kept and the name header is added above it
const NOT_NAME_WORDS = new Set([
    'engineer', 'developer', 'programmer', 'manager', 'director', 'analyst', 'designer',
    'scientist', 'consultant', 'specialist', 'administrator', 'architect', 'intern', 'lead',
    'senior', 'junior', 'staff', 'principal', 'assistant', 'associate', 'coordinator',
    'officer', 'technician', 'recruiter', 'resume', 'résumé', 'curriculum', 'vitae', 'cv',
    'summary', 'profile', 'objective', 'experience', 'education', 'skills', 'contact',
    'professional', 'software', 'data', 'product', 'project', 'full-stack', 'frontend', 'backend',
])

export function looksLikePersonName(line: string): boolean {
    const trimmed = line.trim()
    if (!(trimmed.length > 0 && trimmed.length < 40 && PERSON_NAME_LINE.test(trimmed))) return false
    return !trimmed.split(/[ \t]+/).some((word) => NOT_NAME_WORDS.has(word.toLowerCase()))
}

function withNameHeader(text: string, firstName: string): string {
    const header = `Name: ${firstName} ${SHARED_SURNAME}`
    if (NAME_HEADER.test(text)) {
        return text.replace(NAME_HEADER, (_line, newline: string) => `${header}${newline}`)
    }
    //the first non-empty line is a real name: REPLACE it, so the variant has only the probe name
    const lines = text.split('\n')
    const first = lines.findIndex((line) => line.trim().length > 0)
    if (first >= 0 && looksLikePersonName(lines[first]!)) {
        const carriageReturn = lines[first]!.endsWith('\r') ? '\r' : ''
        lines[first] = `${header}${carriageReturn}`
        return lines.join('\n')
    }
    return `${header}\n${text}`
}

function pick(list: readonly string[], resumeText: string): string {
    return list[textHash(resumeText) % list.length]!
}

//gender holds perceived ethnicity constant (both from the White-coded lists of the same study);
//male-coded is the reference group
function nameGenderVariants(text: string): Variant[] {
    return [
        { label: 'male-coded', text: withNameHeader(text, pick(NAME_LISTS.whiteMale, text)) },
        { label: 'female-coded', text: withNameHeader(text, pick(NAME_LISTS.whiteFemale, text)) },
    ]
}

//ethnicity holds perceived gender constant (picked per resume from the hash);
//White-coded is the reference group, as in Bertrand & Mullainathan
function nameEthnicityVariants(text: string): Variant[] {
    const female = textHash(`gender:${text}`) % 2 === 0
    return [
        { label: 'White-coded', text: withNameHeader(text, pick(female ? NAME_LISTS.whiteFemale : NAME_LISTS.whiteMale, text)) },
        { label: 'Black-coded', text: withNameHeader(text, pick(female ? NAME_LISTS.blackFemale : NAME_LISTS.blackMale, text)) },
    ]
}

//FNV-1a, enough to spread resumes across the name lists
function textHash(text: string): number {
    let hash = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
}


// ===== PRONOUNS =====
// Every he/she pronoun is mapped to its grammatical role, then written out in the target set.
// All variants come from the same template, so they differ only at the pronoun slots.
//
// Only he/she forms are rewritten. "they" in a resume is often plural ("led a team; they shipped..."),
// so it's left alone in every variant; a resume whose only pronouns are they/them returns [].
// "her" is either object ("mentored her") or possessive ("her team"): it's possessive when a
// content word follows. For the they-variant, is/was/has/does right after the pronoun become
// are/were/have/do; other present-tense verbs ("he leads" -> "they leads") are a known limitation,
// and resumes rarely use third-person present tense anyway.

type PronounRole = 'subject' | 'object' | 'determiner' | 'possessive' | 'reflexive'

const PRONOUN_SETS: { label: string; forms: Record<PronounRole, string>; plural: boolean }[] = [
    { label: 'he/him', forms: { subject: 'he', object: 'him', determiner: 'his', possessive: 'his', reflexive: 'himself' }, plural: false },
    { label: 'she/her', forms: { subject: 'she', object: 'her', determiner: 'her', possessive: 'hers', reflexive: 'herself' }, plural: false },
    { label: 'they/them', forms: { subject: 'they', object: 'them', determiner: 'their', possessive: 'theirs', reflexive: 'themselves' }, plural: true },
]

const PRONOUN = /\b(he|him|his|himself|she|her|hers|herself)\b/gi

//words after "her"/"his" that mean it's NOT a determiner ("thanked her for", "the idea was his and")
const NOT_A_NOUN = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'so', 'yet', 'to', 'for', 'with', 'in', 'on', 'at', 'as',
    'by', 'from', 'of', 'into', 'onto', 'about', 'after', 'before', 'during', 'through', 'over', 'under',
    'that', 'this', 'which', 'who', 'when', 'while', 'where', 'how', 'if', 'than', 'then', 'is', 'was',
    'are', 'were', 'be', 'been', 'has', 'have', 'had', 'will', 'would', 'can', 'could', 'should', 'also',
])

//singular -> plural for the they-variant, only when the verb directly follows the subject pronoun
const PLURAL_VERB: Record<string, string> = { is: 'are', was: 'were', has: 'have', does: 'do' }

function roleOf(word: string, rest: string): PronounRole {
    const lower = word.toLowerCase()
    if (lower === 'he' || lower === 'she') return 'subject'
    if (lower === 'him') return 'object'
    if (lower === 'hers') return 'possessive'
    if (lower === 'himself' || lower === 'herself') return 'reflexive'

    //"his" / "her": look at the next word
    //same line only: "she/her" at the end of a line is not "her <next line's first word>"
    const next = /^[ \t]+([A-Za-z][A-Za-z'-]*)/.exec(rest)?.[1]?.toLowerCase()
    const followedByNoun = next !== undefined && !NOT_A_NOUN.has(next)
    if (lower === 'his') return followedByNoun ? 'determiner' : 'possessive'
    return followedByNoun ? 'determiner' : 'object'
}

//keeps the original capitalisation: "He" -> "She", "HE" -> "SHE"
function matchCase(original: string, replacement: string): string {
    if (original.length > 1 && original === original.toUpperCase()) return replacement.toUpperCase()
    if (original[0] === original[0]?.toUpperCase()) return replacement[0]!.toUpperCase() + replacement.slice(1)
    return replacement
}

function pronounVariants(text: string): Variant[] {
    //split into literal pieces and pronoun slots once, so every variant shares the same template
    type Slot = { original: string; role: PronounRole }
    const pieces: (string | Slot)[] = []
    let last = 0
    for (const match of text.matchAll(PRONOUN)) {
        const start = match.index
        pieces.push(text.slice(last, start))
        pieces.push({ original: match[0], role: roleOf(match[0], text.slice(start + match[0].length)) })
        last = start + match[0].length
    }
    pieces.push(text.slice(last))

    if (pieces.length === 1) return []

    return PRONOUN_SETS.map((set) => {
        let out = ''
        for (let i = 0; i < pieces.length; i++) {
            const piece = pieces[i]!
            if (typeof piece !== 'string') {
                out += matchCase(piece.original, set.forms[piece.role])
                continue
            }
            const previous = pieces[i - 1]
            if (set.plural && previous !== undefined && typeof previous !== 'string' && previous.role === 'subject') {
                //"she is" -> "they are" (only the verb right after the pronoun)
                out += piece.replace(/^(\s+)(is|was|has|does)\b/i, (_m, space: string, verb: string) =>
                    space + matchCase(verb, PLURAL_VERB[verb.toLowerCase()]!))
            } else {
                out += piece
            }
        }
        return { label: set.label, text: out }
    })
}


// ===== GRADUATION YEAR (age proxy) =====
// Graduation years are the most common way a resume reveals age. Every 4-digit year from
// 1950-2035 on an EDUCATION line is moved 20 years earlier, so the "older" variant reads like
// the same education finished two decades sooner. A line counts as education when it:
//   - sits inside an Education section: from a heading line like "EDUCATION", "Education:",
//     "Academic Background" or "Qualifications" up to the next section heading, or
//   - has an explicit degree token (B.S., BSc, MBA, PhD, Bachelor of, Master's, Associate of,
//     diploma, ...).
// Words like "university", "college", "graduate" or "associate" alone are NOT enough: they also
// appear in job lines ("Associate Software Engineer", "Teaching Assistant, State University"),
// and shifting job dates would change more than the age proxy.
// The reference is the original text.

export const GRADUATION_YEAR_OFFSET = -20

//case-insensitive degree phrases. "Master"/"Bachelor"/"Doctor" need "of"/"in"/"'s"/"degree"
//so "Scrum Master, Acme, 2019" isn't a degree line
const DEGREE_PHRASES = /\b(?:bachelor(?:'s|s)?\s+(?:of|in|degree)\b|bachelor's|master(?:'s|s)?\s+(?:of|in|degree)\b|master's|doctor\s+of\b|doctorate\b|associate\s+of\b|associate'?s\s+degree\b|diploma\b|high school\b|ged\b|class of\b|mba\b|b\.?sc\b|m\.?sc\b|b\.?eng\b|m\.?eng\b|ph\.?\s?d\b)/i
//short abbreviations must match case. Bare "MA"/"AS" are left out on purpose:
//"Boston, MA, 2018-2022" is a job line, not a degree
const DEGREE_ABBREVIATIONS = /(?:^|[^A-Za-z.])(?:BS|BA|MS|B\.S|B\.A|M\.S|M\.A|A\.A|A\.S)(?![A-Za-z])/
const YEAR = /\b(19[5-9]\d|20[0-2]\d|203[0-5])\b/g

//"EDUCATION", "Education:", "Academic Background", "Qualifications" - a heading, not an entry
//("Education: B.S. ..., 2016" has a degree token anyway)
const EDUCATION_HEADING = /^\s*(?:education|academic|qualifications)\b[\p{L} &/'-]*:?\s*$/iu

//a section heading's shape: a few words of letters only, maybe a trailing colon
const HEADING_SHAPE = /^\s*\p{L}[\p{L} &/'-]{0,38}:?\s*$/u

function isEducationHeading(line: string): boolean {
    return line.trim().length <= 40 && EDUCATION_HEADING.test(line)
}

//the line that ends an Education section: ALL-CAPS ("EXPERIENCE"), or Title Case that ends with
//a colon or follows a blank line ("Work Experience"). Entries inside the section rarely look
//like that ("State University, 2014 - 2018" has digits and a comma).
function isSectionHeading(line: string, previous: string | undefined): boolean {
    if (!HEADING_SHAPE.test(line)) return false
    const trimmed = line.trim()
    const letters = trimmed.replace(/[^\p{L}]/gu, '')
    if (letters.length >= 2 && letters === letters.toUpperCase()) return true
    const words = trimmed.replace(/:$/, '').split(/\s+/).filter((word) => /\p{L}/u.test(word))
    const titleCase = words.length > 0 && words.length <= 4 && words.every((word) => /^\p{Lu}/u.test(word))
    return titleCase && (trimmed.endsWith(':') || previous === undefined || previous.trim() === '')
}

export function hasDegreeToken(line: string): boolean {
    return DEGREE_PHRASES.test(line) || DEGREE_ABBREVIATIONS.test(line)
}

function graduationYearVariants(text: string): Variant[] {
    let changed = false
    let inEducation = false
    const lines = text.split('\n')
    const shifted = lines
        .map((line, index) => {
            if (isEducationHeading(line)) inEducation = true
            else if (inEducation && isSectionHeading(line, lines[index - 1])) inEducation = false

            if (!inEducation && !hasDegreeToken(line)) return line
            return line.replace(YEAR, (year) => {
                changed = true
                return String(Number(year) + GRADUATION_YEAR_OFFSET)
            })
        })
        .join('\n')

    if (!changed) return []

    return [
        { label: 'original', text },
        { label: '+20 years older', text: shifted },
    ]
}
