export const APP_BASE_PATH = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH || "");

export function withBasePath(path: string) {
    if (!path.startsWith("/")) return path;
    if (!APP_BASE_PATH || path === APP_BASE_PATH || path.startsWith(`${APP_BASE_PATH}/`)) return path;
    return `${APP_BASE_PATH}${path}`;
}

function normalizeBasePath(value: string) {
    const trimmed = value.trim().replace(/\/+$/, "");
    if (!trimmed || trimmed === "/") return "";
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
