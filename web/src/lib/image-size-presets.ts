export type ImageResolutionKey = "1K" | "2K" | "4K";

export type ImageSizePreset = {
    id: string;
    ratio: string;
    name: string;
    sizes: Record<ImageResolutionKey, string>;
};

export type ResolvedImageSizePreset = {
    presetId: string;
    resolution: ImageResolutionKey;
    size: string;
};

export const IMAGE_RESOLUTION_OPTIONS: { value: ImageResolutionKey; label: string }[] = [
    { value: "1K", label: "1K" },
    { value: "2K", label: "2K" },
    { value: "4K", label: "4K" },
];

export const IMAGE_SIZE_PRESETS: ImageSizePreset[] = [
    { id: "square", ratio: "1:1", name: "Square", sizes: { "1K": "1024x1024", "2K": "2048x2048", "4K": "2880x2880" } },
    { id: "widescreen", ratio: "16:9", name: "Widescreen", sizes: { "1K": "1280x720", "2K": "2048x1152", "4K": "3840x2160" } },
    { id: "story", ratio: "9:16", name: "Story", sizes: { "1K": "720x1280", "2K": "1152x2048", "4K": "2160x3840" } },
    { id: "print", ratio: "5:4", name: "Print", sizes: { "1K": "1040x832", "2K": "2080x1664", "4K": "3200x2560" } },
    { id: "feed", ratio: "4:5", name: "Feed", sizes: { "1K": "832x1040", "2K": "1664x2080", "4K": "2560x3200" } },
    { id: "classic", ratio: "4:3", name: "Classic", sizes: { "1K": "1024x768", "2K": "2048x1536", "4K": "3264x2448" } },
    { id: "vertical", ratio: "3:4", name: "Vertical", sizes: { "1K": "768x1024", "2K": "1536x2048", "4K": "2448x3264" } },
    { id: "photo", ratio: "3:2", name: "Photo", sizes: { "1K": "1008x672", "2K": "2064x1376", "4K": "3504x2336" } },
    { id: "portrait", ratio: "2:3", name: "Portrait", sizes: { "1K": "672x1008", "2K": "1376x2064", "4K": "2336x3504" } },
    { id: "exclusive", ratio: "21:9", name: "Exclusive", sizes: { "1K": "1344x576", "2K": "2016x864", "4K": "3808x1632" } },
];

export function resolveImageSizeValue(presetId: string, resolution: string) {
    const preset = IMAGE_SIZE_PRESETS.find((item) => item.id === presetId);
    if (!preset || !isImageResolutionKey(resolution)) return undefined;
    return preset.sizes[resolution];
}

export function resolveImageSizePreset(size: string): ResolvedImageSizePreset | null {
    const normalized = normalizeSizeValue(size);
    if (!normalized) return null;
    for (const preset of IMAGE_SIZE_PRESETS) {
        for (const resolution of IMAGE_RESOLUTION_OPTIONS) {
            if (preset.sizes[resolution.value] === normalized) {
                return { presetId: preset.id, resolution: resolution.value, size: normalized };
            }
        }
    }
    return null;
}

export function describeImageSizeValue(size: string) {
    const resolved = resolveImageSizePreset(size);
    if (resolved) {
        const preset = IMAGE_SIZE_PRESETS.find((item) => item.id === resolved.presetId);
        return preset ? `${preset.ratio} ${preset.name} · ${resolved.resolution}` : size;
    }
    const dimensions = parseImageSize(size);
    return dimensions ? `${dimensions.width}×${dimensions.height}` : size;
}

export function parseImageSize(size: string) {
    const match = normalizeSizeValue(size)?.match(/^(\d+)x(\d+)$/);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

function normalizeSizeValue(size: string) {
    return String(size || "")
        .trim()
        .toLowerCase()
        .replace("×", "x");
}

function isImageResolutionKey(value: string): value is ImageResolutionKey {
    return value === "1K" || value === "2K" || value === "4K";
}
