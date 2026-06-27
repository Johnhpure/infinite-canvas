"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { apiGet } from "@/services/api/request";
import { IMAGE_SIZE_PRESETS } from "@/lib/image-size-presets";
import type { AdminPublicSettings } from "@/services/api/admin";

export type LocalModelChannel = {
    id: string;
    protocol: "openai" | "gemini";
    name: string;
    baseUrl: string;
    apiKey: string;
    models: string[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    localChannels: LocalModelChannel[];
    imageChannelId: string;
    textChannelId: string;
    activeChannelId: string;
    apiMode: "images" | "responses";
    model: string;
    imageModel: string;
    textModel: string;
    timeout: string;
    retryAttempts: string;
    streamImages: boolean;
    streamPartialImages: string;
    responseFormatB64Json: boolean;
    codexCli: boolean;
    systemPrompt: string;
    systemPrompts: {
        image: string;
        text: string;
        workflow: string;
        workflowAgent: string;
    };
    syncModelConfig: boolean;
    syncStorageConfig: boolean;
    models: string[];
    publicChannels: AdminPublicSettings["modelChannel"]["channels"];
    quality: string;
    size: string;
    outputFormat: "png" | "jpeg" | "webp";
    outputCompression: string;
    moderation: "auto" | "low";
    count: string;
    canvasImageCount: string;
    seed?: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
export const OPENAI_BASE_URL = "https://api.openai.com";
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

export const defaultConfig: AiConfig = {
    channelMode: "remote",
    baseUrl: "",
    apiKey: "",
    localChannels: [],
    imageChannelId: "",
    textChannelId: "",
    activeChannelId: "",
    apiMode: "images",
    model: "gpt-image-2",
    imageModel: "gpt-image-2",
    textModel: "gpt-5.5",
    timeout: "600",
    retryAttempts: "0",
    streamImages: false,
    streamPartialImages: "1",
    responseFormatB64Json: true,
    codexCli: false,
    systemPrompt: "",
    systemPrompts: { image: "", text: "", workflow: "", workflowAgent: "" },
    syncModelConfig: false,
    syncStorageConfig: false,
    models: [],
    publicChannels: [],
    quality: "auto",
    size: "1024x1024",
    outputFormat: "png",
    outputCompression: "100",
    moderation: "auto",
    count: "1",
    canvasImageCount: "3",
    seed: "",
};

type ConfigStore = {
    config: AiConfig;
    publicSettings: AdminPublicSettings | null;
    isPublicSettingsLoading: boolean;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    loadPublicSettings: () => Promise<void>;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

function resolveEffectiveConfig(config: AiConfig, modelChannel: AdminPublicSettings["modelChannel"] | null) {
    const channelMode = "remote";
    const publicChannels = mergePublicChannels(modelChannel?.channels || [], config.publicChannels || []);
    const models = Array.from(new Set([...(modelChannel?.availableModels || []), ...(config.models || []), ...publicChannels.flatMap((channel) => channel.models)]));
    const fallbackModel = modelChannel?.defaultModel || models[0] || config.model || "";
    const imageDefault = modelChannel?.defaultImageModel || (models.includes(config.imageModel) ? config.imageModel : fallbackModel);
    const textDefault = modelChannel?.defaultTextModel || (models.includes(config.textModel) ? config.textModel : fallbackModel);
    const imageChannelId = validChannelId(config.imageChannelId, publicChannels, config.imageModel) || channelIdForModel(publicChannels, imageDefault);
    const textChannelId = validChannelId(config.textChannelId, publicChannels, config.textModel) || channelIdForModel(publicChannels, textDefault);
    return {
        ...config,
        channelMode,
        models,
        publicChannels,
        model: models.includes(config.model) ? config.model : fallbackModel,
        imageModel: models.includes(config.imageModel) ? config.imageModel : imageDefault,
        textModel: models.includes(config.textModel) ? config.textModel : textDefault,
        imageChannelId,
        textChannelId,
        activeChannelId: "",
        baseUrl: "",
        apiKey: "",
        localChannels: [],
        systemPrompt: modelChannel?.systemPrompts?.image || modelChannel?.systemPrompt || config.systemPrompt,
        systemPrompts: modelChannel?.systemPrompts || config.systemPrompts || defaultConfig.systemPrompts,
    };
}

function mergePublicChannels(primary: AdminPublicSettings["modelChannel"]["channels"], secondary: AdminPublicSettings["modelChannel"]["channels"]) {
    const map = new Map<string, AdminPublicSettings["modelChannel"]["channels"][number]>();
    [...primary, ...secondary].forEach((channel) => {
        if (channel.id) map.set(channel.id, channel);
    });
    return Array.from(map.values());
}

function normalizeLocalConfig(config: AiConfig) {
    const localChannels = normalizeLocalChannels(config);
    const models = Array.from(new Set(localChannels.flatMap((channel) => channel.models)));
    return { ...config, localChannels, models };
}

export function normalizeLocalChannels(config: Partial<AiConfig>) {
    const channels = Array.isArray(config.localChannels) ? config.localChannels : [];
    const normalized = channels.map((channel, index) => ({
        id: channel.id || `local-${index + 1}`,
        protocol: channel.protocol === "gemini" ? ("gemini" as const) : ("openai" as const),
        name: typeof channel.name === "string" ? channel.name : `本地渠道 ${index + 1}`,
        baseUrl: channel.baseUrl || (channel.protocol === "gemini" ? GEMINI_BASE_URL : ""),
        apiKey: channel.apiKey || "",
        models: Array.isArray(channel.models) ? channel.models.filter(Boolean) : [],
    }));
    if (!normalized.length) {
        normalized.push({ id: "local-default", protocol: "openai", name: "本地直连", baseUrl: config.baseUrl || defaultConfig.baseUrl, apiKey: config.apiKey || "", models: Array.isArray(config.models) ? config.models.filter(Boolean) : [] });
    }
    return normalized;
}

function validChannelId(channelId: string, channels: AdminPublicSettings["modelChannel"]["channels"], model: string) {
    return channels.some((channel) => channel.id === channelId && channel.models.includes(model)) ? channelId : "";
}

function channelIdForModel(channels: AdminPublicSettings["modelChannel"]["channels"], model: string) {
    return channels.find((channel) => channel.models.includes(model))?.id || channels[0]?.id || "";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const channel = localChannelForActiveModel({ ...config, model });
    return Boolean(model.trim()) && (config.channelMode === "remote" || Boolean(channel?.baseUrl.trim() && channel?.apiKey.trim()));
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            publicSettings: null,
            isPublicSettingsLoading: false,
            isConfigOpen: false,
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: key === "size" ? normalizeImageSize(String(value)) : value,
                        channelMode: "remote",
                        baseUrl: "",
                        apiKey: "",
                        localChannels: [],
                    },
                })),
            loadPublicSettings: async () => {
                if (get().isPublicSettingsLoading) return;
                set({ isPublicSettingsLoading: true });
                try {
                    set({ publicSettings: await apiGet<AdminPublicSettings>("/api/settings") });
                } finally {
                    set({ isPublicSettingsLoading: false });
                }
            },
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false) => set({ isConfigOpen: true, shouldPromptContinue }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config }),
            merge: (persisted, current) => {
                const config = { ...defaultConfig, ...((persisted as Partial<ConfigStore>).config || {}) };
                const size = normalizeImageSize(config.size);
                return {
                    ...current,
                    config: {
                        ...config,
                        localChannels: [],
                        baseUrl: "",
                        apiKey: "",
                        imageChannelId: config.imageChannelId || "",
                        textChannelId: config.textChannelId || "",
                        activeChannelId: "",
                        channelMode: "remote",
                        apiMode: config.apiMode === "responses" ? "responses" : "images",
                        imageModel: config.imageModel || config.model,
                        textModel: config.textModel || config.model,
                        timeout: config.timeout || "600",
                        size,
                        streamPartialImages: config.streamPartialImages || "1",
                        responseFormatB64Json: config.responseFormatB64Json !== false,
                        outputFormat: ["jpeg", "webp"].includes(config.outputFormat) ? config.outputFormat : "png",
                        outputCompression: config.outputCompression || "100",
                        moderation: config.moderation === "low" ? "low" : "auto",
                        retryAttempts: config.retryAttempts || "0",
                        canvasImageCount: config.canvasImageCount || "3",
                        systemPrompts: { ...defaultConfig.systemPrompts, ...(config.systemPrompts || {}) },
                        syncModelConfig: config.syncModelConfig === true,
                        syncStorageConfig: config.syncStorageConfig === true,
                        seed: config.seed ?? "",
                    },
                };
            },
        },
    ),
);

function normalizeImageSize(size: string) {
    const value = String(size || "")
        .trim()
        .toLowerCase();
    if (!value || value === "auto") return defaultConfig.size;
    if (/^\d+x\d+$/.test(value)) return value;
    return IMAGE_SIZE_PRESETS.find((item) => item.ratio === value)?.sizes["1K"] || defaultConfig.size;
}

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    const modelChannel = useConfigStore((state) => state.publicSettings?.modelChannel || null);
    return useMemo(() => resolveEffectiveConfig(config, modelChannel), [config, modelChannel]);
}

export function useSiteInfo() {
    const site = useConfigStore((state) => state.publicSettings?.site);
    return {
        name: site?.name || "无限画布",
        subtitle: site?.subtitle || "",
        description: site?.description || "一个无限画布创作工具",
        logoUrl: site?.logoUrl || "",
        faviconUrl: site?.faviconUrl || "",
        copyright: site?.copyright || "",
    };
}

export function buildApiUrl(baseUrl: string, path: string) {
    const normalizedBaseUrl = normalizeArkPlanBaseUrl(baseUrl.trim().replace(/\/+$/, ""));
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const hasApiVersion = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3");
    const apiBaseUrl = hasApiVersion ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

export function defaultBaseUrlForProtocol(protocol: "openai" | "gemini") {
    return protocol === "gemini" ? GEMINI_BASE_URL : OPENAI_BASE_URL;
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex >= 0) {
            url.pathname = path.slice(0, arkPlanIndex + "/api/plan/v3".length);
            url.search = "";
            url.hash = "";
            return url.toString().replace(/\/+$/, "");
        }
    } catch {
        // Keep string fallback below.
    }
    const marker = "ark.cn-beijing.volces.com/api/v3";
    const lower = baseUrl.toLowerCase();
    if (!lower.includes(marker)) return baseUrl;
    return baseUrl.replace(/\/api\/v3.*$/i, "/api/plan/v3");
}

export function channelIdForActiveModel(config: AiConfig) {
    if (config.activeChannelId) return config.activeChannelId;
    if (config.model === config.textModel) return config.textChannelId;
    return config.imageChannelId;
}

export function localChannelForActiveModel(config: AiConfig) {
    const channels = normalizeLocalChannels(config);
    const preferredId = channelIdForActiveModel(config);
    return channels.find((channel) => channel.id === preferredId && channel.models.includes(config.model)) || channels.find((channel) => channel.models.includes(config.model)) || channels.find((channel) => channel.id === preferredId) || channels[0];
}
