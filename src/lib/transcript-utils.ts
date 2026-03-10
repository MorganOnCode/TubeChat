/**
 * Shared transcript text utilities (safe for both client and server).
 * Keep this file free of Node.js-specific imports (child_process, fs, etc.)
 */

interface CleanOptions {
    removeFillers?: boolean;
    addParagraphs?: boolean;
    sentencesPerParagraph?: number;
}

/**
 * Clean raw transcript text for display.
 */
export function cleanTranscriptText(text: string, options: CleanOptions = {}): string {
    const {
        removeFillers = true,
        addParagraphs = true,
        sentencesPerParagraph = 5,
    } = options;

    let cleaned = text
        .replace(/\s+/g, ' ')
        .trim();

    if (removeFillers) {
        // Remove common filler words/phrases (case insensitive)
        cleaned = cleaned
            .replace(/\b(um|uh|uhh|umm|erm|hmm|like,?\s+you know|you know,?\s+like)\b/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    if (addParagraphs) {
        // Split into sentences and group into paragraphs
        const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
        const paragraphs: string[] = [];
        
        for (let i = 0; i < sentences.length; i += sentencesPerParagraph) {
            const paragraph = sentences
                .slice(i, i + sentencesPerParagraph)
                .join(' ')
                .trim();
            if (paragraph) paragraphs.push(paragraph);
        }

        return paragraphs.join('\n\n');
    }

    return cleaned;
}
