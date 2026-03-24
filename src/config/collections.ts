/**
 * Curated channel collections
 * Add new collections here — they'll be auto-seeded on first ingestion
 */

export interface CollectionConfig {
    name: string;
    slug: string;
    description: string;
    channels: {
        url: string;
        // YouTube channel ID extracted from URL or manually provided
        channelId?: string;
    }[];
}

export const COLLECTIONS: CollectionConfig[] = [
    {
        name: 'UFO & NHI',
        slug: 'ufo',
        description: 'Unidentified Aerial Phenomena and Non-Human Intelligence research channels',
        channels: [
            { url: 'https://www.youtube.com/@Area52Investigations' },
            { url: 'https://www.youtube.com/@JesseMichels' },
            { url: 'https://www.youtube.com/@UAPGerb' },
            { url: 'https://www.youtube.com/@ProjectUnity' },
            { url: 'https://www.youtube.com/@TheWhyFiles' },
            { url: 'https://www.youtube.com/@THIRDEYEDROPS' },
            { url: 'https://www.youtube.com/@dannyjones' },
            { url: 'https://www.youtube.com/@TheDreamlandMotel' },
            { url: 'https://www.youtube.com/@VETTEDPODCAST' },
            { url: 'https://www.youtube.com/@bledsoesaidsoprojects' },
            { url: 'https://www.youtube.com/@thelandofchem' },
            { url: 'https://www.youtube.com/@UnchartedX' },
        ],
    },
];
