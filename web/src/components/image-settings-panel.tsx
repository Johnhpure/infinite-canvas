"use client";

import { useState, type ReactNode } from "react";
import { ConfigProvider } from "antd";

import { type CanvasTheme } from "@/lib/canvas-theme";
import { IMAGE_RESOLUTION_OPTIONS, IMAGE_SIZE_PRESETS, describeImageSizeValue, parseImageSize, resolveImageSizePreset, resolveImageSizeValue, type ImageResolutionKey } from "@/lib/image-size-presets";
import type { AiConfig } from "@/stores/use-config-store";

const qualityOptions = [
    { value: "auto", label: "自动" },
    { value: "high", label: "高" },
    { value: "medium", label: "中" },
    { value: "low", label: "低" },
];

const MAX_IMAGE_LONG_EDGE = 3840;

const formatOptions = [
    { value: "png", label: "PNG" },
    { value: "jpeg", label: "JPEG" },
    { value: "webp", label: "WebP" },
];

const moderationOptions = [
    { value: "auto", label: "自动" },
    { value: "low", label: "低" },
];

type ImageSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
    maxCount?: number;
    quickCount?: number;
    collapsible?: boolean;
};

type ImageSettingSectionKey = "quality" | "size" | "count" | "retry" | "format" | "compression" | "moderation" | "seed";

const defaultCollapsedSettings: Record<ImageSettingSectionKey, boolean> = {
    quality: false,
    size: false,
    count: true,
    retry: true,
    format: true,
    compression: true,
    moderation: true,
    seed: true,
};

export function ImageSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5", maxCount = 15, quickCount = 10, collapsible = false }: ImageSettingsPanelProps) {
    const [collapsedSettings, setCollapsedSettings] = useState(defaultCollapsedSettings);
    const [customSizeOpen, setCustomSizeOpen] = useState(false);
    const resolvedSize = resolveImageSizePreset(config.size || "") || { presetId: IMAGE_SIZE_PRESETS[0].id, resolution: "1K" as ImageResolutionKey, size: IMAGE_SIZE_PRESETS[0].sizes["1K"] };
    const quality = config.quality || "auto";
    const count = Math.max(1, Math.min(maxCount, Math.floor(Math.abs(Number(config.count)) || 1)));
    const retryAttempts = Math.max(0, Math.min(5, Math.floor(Math.abs(Number(config.retryAttempts)) || 0)));
    const activeSize = config.size || resolvedSize.size;
    const outputFormat = config.outputFormat || "png";
    const outputCompression = Math.max(0, Math.min(100, Math.floor(Number(config.outputCompression) || 100)));
    const moderation = config.moderation || "auto";
    const isCustomSize = customSizeOpen || !resolveImageSizePreset(activeSize);
    const dimensions = readSizeDimensions(activeSize, parseImageSize(resolvedSize.size) || { width: 1024, height: 1024 });
    const selectPreset = (presetId: string) => {
        const nextSize = resolveImageSizeValue(presetId, resolvedSize.resolution);
        if (!nextSize) return;
        setCustomSizeOpen(false);
        onConfigChange("size", nextSize);
    };
    const selectResolution = (resolution: ImageResolutionKey) => {
        const nextSize = resolveImageSizeValue(resolvedSize.presetId, resolution);
        if (!nextSize) return;
        setCustomSizeOpen(false);
        onConfigChange("size", nextSize);
    };
    const updateDimension = (key: "width" | "height", value: number | null) => {
        const next = Math.max(1, Math.min(MAX_IMAGE_LONG_EDGE, Math.floor(value || dimensions[key] || 1024)));
        onConfigChange("size", `${key === "width" ? next : dimensions.width}x${key === "height" ? next : dimensions.height}`);
    };
    const renderSection = (key: ImageSettingSectionKey, title: string, summary: string, children: ReactNode) => {
        if (!collapsible) {
            return (
                <div className="space-y-2.5">
                    <SettingTitle color={theme.node.muted}>{title}</SettingTitle>
                    {children}
                </div>
            );
        }
        const collapsed = collapsedSettings[key];
        return (
            <CollapsibleSettingGroup
                key={key}
                title={title}
                summary={summary}
                collapsed={collapsed}
                theme={theme}
                onToggle={() =>
                    setCollapsedSettings((value) => ({
                        ...value,
                        [key]: !value[key],
                    }))
                }
            >
                {children}
            </CollapsibleSettingGroup>
        );
    };

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">图像设置</div> : null}
                {renderSection(
                    "size",
                    "尺寸",
                    imageSizeLabel(activeSize),
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                            {IMAGE_SIZE_PRESETS.map((item) => (
                                <SizePresetCard key={item.id} preset={item} selected={!isCustomSize && resolvedSize.presetId === item.id} theme={theme} onClick={() => selectPreset(item.id)} />
                            ))}
                            <button
                                type="button"
                                className="min-h-[88px] cursor-pointer rounded-2xl border p-2.5 text-left transition hover:opacity-85"
                                style={{ borderColor: isCustomSize ? theme.node.text : theme.node.stroke, background: isCustomSize ? theme.node.fill : "transparent", color: theme.node.text }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => setCustomSizeOpen(true)}
                            >
                                <div className="mb-2 flex h-8 items-center justify-center rounded-xl border border-dashed" style={{ borderColor: theme.node.stroke }}>
                                    <span className="text-xs" style={{ color: theme.node.muted }}>
                                        W×H
                                    </span>
                                </div>
                                <div className="text-sm font-medium">自定义</div>
                                <div className="text-xs" style={{ color: theme.node.muted }}>
                                    手动尺寸
                                </div>
                            </button>
                        </div>
                        <div className="space-y-2">
                            <SettingTitle color={theme.node.muted}>分辨率</SettingTitle>
                            <div className="grid grid-cols-3 gap-2.5">
                                {IMAGE_RESOLUTION_OPTIONS.map((item) => (
                                    <OptionPill key={item.value} selected={!isCustomSize && resolvedSize.resolution === item.value} theme={theme} onClick={() => selectResolution(item.value)}>
                                        {item.label}
                                    </OptionPill>
                                ))}
                            </div>
                        </div>
                        {isCustomSize ? (
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                                <DimensionInput prefix="W" value={dimensions.width} theme={theme} onChange={(value) => updateDimension("width", value)} />
                                <span className="text-lg opacity-45">×</span>
                                <DimensionInput prefix="H" value={dimensions.height} theme={theme} onChange={(value) => updateDimension("height", value)} />
                            </div>
                        ) : (
                            <div className="text-xs" style={{ color: theme.node.muted }}>
                                当前输出 {dimensions.width} × {dimensions.height} px
                            </div>
                        )}
                    </div>,
                )}
                {renderSection(
                    "quality",
                    "质量",
                    imageQualityLabel(quality),
                    <div className="grid grid-cols-4 gap-2.5">
                        {qualityOptions.map((item) => (
                            <OptionPill key={item.value} selected={quality === item.value} theme={theme} onClick={() => onConfigChange("quality", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>,
                )}
                {renderSection(
                    "count",
                    "生成张数",
                    `${count} 张`,
                    <div className="grid grid-cols-4 gap-2.5">
                        {Array.from({ length: quickCount }, (_, index) => index + 1).map((value) => (
                            <OptionPill key={value} selected={count === value} theme={theme} onClick={() => onConfigChange("count", String(value))}>
                                {value} 张
                            </OptionPill>
                        ))}
                        <CountInput value={count} max={maxCount} theme={theme} onChange={(value) => onConfigChange("count", String(value || 1))} />
                    </div>,
                )}
                {(() => {
                    const modelLower = config.model?.toLowerCase().replace(/[\s_]+/g, "-") || "";
                    const isAgnesModel = modelLower.startsWith("agnes-image") || modelLower.startsWith("agens-image");
                    return isAgnesModel;
                })()
                    ? renderSection(
                          "seed",
                          "随机种子 (Seed)",
                          config.seed ? String(config.seed) : "自适应随机",
                          <div className="flex h-9 overflow-hidden rounded-xl border text-sm transition-all focus-within:border-current" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                              <input
                                  type="text"
                                  placeholder="留空使用自适应分发算法"
                                  className="min-w-0 flex-1 bg-transparent px-3 outline-none"
                                  style={{ color: theme.node.text }}
                                  value={config.seed ?? ""}
                                  onChange={(event) => {
                                      const val = event.target.value;
                                      if (val === "" || /^-?\d*$/.test(val)) {
                                          onConfigChange("seed", val);
                                      }
                                  }}
                                  onMouseDown={(event) => event.stopPropagation()}
                              />
                              {config.seed ? (
                                  <button type="button" className="grid w-9 place-items-center cursor-pointer opacity-60 hover:opacity-100" style={{ color: theme.node.text }} onClick={() => onConfigChange("seed", "")}>
                                      ✕
                                  </button>
                              ) : null}
                          </div>,
                      )
                    : null}
                {renderSection("retry", "失败重试", `${retryAttempts} 次`, <RetryInput value={retryAttempts} theme={theme} onChange={(value) => onConfigChange("retryAttempts", String(value))} />)}
                {renderSection(
                    "format",
                    "格式",
                    imageFormatLabel(outputFormat),
                    <div className="grid grid-cols-3 gap-2.5">
                        {formatOptions.map((item) => (
                            <OptionPill key={item.value} selected={outputFormat === item.value} theme={theme} onClick={() => onConfigChange("outputFormat", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>,
                )}
                {renderSection(
                    "compression",
                    "压缩",
                    outputFormat === "png" ? "PNG 不压缩" : `${outputCompression}`,
                    <RangeInput value={outputCompression} disabled={outputFormat === "png"} theme={theme} onChange={(value) => onConfigChange("outputCompression", String(value))} />,
                )}
                {renderSection(
                    "moderation",
                    "审核",
                    moderation === "low" ? "低" : "自动",
                    <div className="grid grid-cols-2 gap-2.5">
                        {moderationOptions.map((item) => (
                            <OptionPill key={item.value} selected={moderation === item.value} theme={theme} onClick={() => onConfigChange("moderation", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>,
                )}
            </div>
        </ImageSettingsTheme>
    );
}

export function ImageSettingsTheme({ theme, children }: { theme: CanvasTheme; children: ReactNode }) {
    return (
        <ConfigProvider
            theme={{
                token: { colorBgContainer: theme.toolbar.panel, colorBgElevated: theme.toolbar.panel, colorBorder: theme.node.stroke, colorPrimary: theme.node.activeStroke, colorText: theme.node.text, colorTextLightSolid: theme.node.panel },
                components: { Button: { defaultBg: theme.toolbar.panel, defaultBorderColor: theme.node.stroke, defaultColor: theme.node.text } },
            }}
        >
            {children}
        </ConfigProvider>
    );
}

export function imageQualityLabel(value: string) {
    return ({ auto: "自动", high: "高", medium: "中", low: "低" } as Record<string, string>)[value] || value;
}

export function imageSizeLabel(size: string) {
    if (!size || size === "auto") return "自动";
    return describeImageSizeValue(size);
}

export function imageFormatLabel(value: string) {
    return ({ png: "PNG", jpeg: "JPEG", webp: "WebP" } as Record<string, string>)[value] || value;
}

function SizePresetCard({ preset, selected, theme, onClick }: { preset: (typeof IMAGE_SIZE_PRESETS)[number]; selected: boolean; theme: CanvasTheme; onClick: () => void }) {
    const [widthRatio, heightRatio] = preset.ratio.split(":").map(Number);
    const isWide = widthRatio >= heightRatio;
    const longSide = 34;
    const shortSide = Math.max(12, Math.round(longSide / (Math.max(widthRatio, heightRatio) / Math.min(widthRatio, heightRatio))));
    const iconWidth = isWide ? longSide : shortSide;
    const iconHeight = isWide ? shortSide : longSide;
    return (
        <button
            type="button"
            className="min-h-[88px] cursor-pointer rounded-2xl border p-2.5 text-left transition hover:-translate-y-0.5 hover:opacity-90"
            style={{ borderColor: selected ? theme.node.text : theme.node.stroke, background: selected ? theme.node.fill : "transparent", color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            <div className="mb-2 flex h-8 items-center justify-center rounded-xl" style={{ background: theme.toolbar.panel }}>
                <span className="block rounded-md border-2" style={{ width: iconWidth, height: iconHeight, borderColor: selected ? theme.node.text : theme.node.stroke, background: selected ? theme.node.activeStroke : "transparent" }} />
            </div>
            <div className="text-sm font-semibold leading-none">{preset.ratio}</div>
            <div className="mt-1 truncate text-xs" style={{ color: theme.node.muted }}>
                {preset.name}
            </div>
        </button>
    );
}

function OptionPill({ selected, theme, onClick, children }: { selected: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80"
            style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function CollapsibleSettingGroup({ title, summary, collapsed, theme, children, onToggle }: { title: string; summary: string; collapsed: boolean; theme: CanvasTheme; children: ReactNode; onToggle: () => void }) {
    return (
        <section className="overflow-hidden rounded-lg border" style={{ borderColor: theme.node.stroke, background: theme.toolbar.panel }}>
            <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm" style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onClick={onToggle}>
                <span className="min-w-0">
                    <span className="font-medium">{title}</span>
                    {collapsed ? (
                        <span className="ml-2 truncate text-xs" style={{ color: theme.node.muted }}>
                            {summary}
                        </span>
                    ) : null}
                </span>
                <span className="shrink-0 text-xs" style={{ color: theme.node.muted }}>
                    {collapsed ? "展开" : "收起"}
                </span>
            </button>
            {!collapsed ? (
                <div className="border-t p-3" style={{ borderColor: theme.node.stroke }}>
                    {children}
                </div>
            ) : null}
        </section>
    );
}

function DimensionInput({ prefix, value, theme, onChange }: { prefix: string; value: number; theme: CanvasTheme; onChange: (value: number | null) => void }) {
    return (
        <label className="flex h-9 overflow-hidden rounded-xl text-sm" style={{ background: theme.node.fill, color: theme.node.text }}>
            <span className="grid w-9 place-items-center" style={{ color: theme.node.muted }}>
                {prefix}
            </span>
            <input
                type="number"
                min={1}
                max={MAX_IMAGE_LONG_EDGE}
                className="min-w-0 flex-1 bg-transparent px-2 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={value || ""}
                onChange={(event) => onChange(Number(event.target.value) || null)}
                onMouseDown={(event) => event.stopPropagation()}
            />
        </label>
    );
}

function CountInput({ value, max, theme, onChange }: { value: number; max: number; theme: CanvasTheme; onChange: (value: number | null) => void }) {
    return (
        <label className="col-span-2 flex h-9 overflow-hidden rounded-full border text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <input
                type="number"
                min={1}
                max={max}
                className="min-w-0 flex-1 bg-transparent px-3 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                style={{ color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                value={value || ""}
                onChange={(event) => onChange(Number(event.target.value) || null)}
                onMouseDown={(event) => event.stopPropagation()}
            />
        </label>
    );
}

function RetryInput({ value, theme, onChange }: { value: number; theme: CanvasTheme; onChange: (value: number) => void }) {
    return (
        <label className="flex h-9 overflow-hidden rounded-full border text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <input
                type="number"
                min={0}
                max={5}
                className="min-w-0 flex-1 bg-transparent px-3 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                style={{ color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                value={value}
                onChange={(event) => onChange(Math.max(0, Math.min(5, Math.floor(Number(event.target.value) || 0))))}
                onMouseDown={(event) => event.stopPropagation()}
            />
            <span className="grid w-12 place-items-center border-l text-xs opacity-60" style={{ borderColor: theme.node.stroke }}>
                次
            </span>
        </label>
    );
}

function RangeInput({ value, disabled, theme, onChange }: { value: number; disabled: boolean; theme: CanvasTheme; onChange: (value: number) => void }) {
    return (
        <div className="grid grid-cols-[1fr_64px] items-center gap-2.5" style={{ opacity: disabled ? 0.55 : 1 }}>
            <input
                type="range"
                min={0}
                max={100}
                disabled={disabled}
                className="min-w-0 accent-current"
                style={{ color: theme.node.activeStroke }}
                value={value}
                onChange={(event) => onChange(Number(event.target.value) || 0)}
                onMouseDown={(event) => event.stopPropagation()}
            />
            <label className="flex h-9 overflow-hidden rounded-full border text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={disabled}
                    className="min-w-0 flex-1 bg-transparent px-2 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    style={{ color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                    value={value}
                    onChange={(event) => onChange(Math.max(0, Math.min(100, Number(event.target.value) || 0)))}
                    onMouseDown={(event) => event.stopPropagation()}
                />
            </label>
        </div>
    );
}

function SettingTitle({ children, color }: { children: string; color: string }) {
    return (
        <div className="text-xs font-medium" style={{ color }}>
            {children}
        </div>
    );
}

function readSizeDimensions(size: string, fallback: { width: number; height: number }) {
    const dimensions = parseImageSize(size);
    if (dimensions) return dimensions;
    const ratioSize = IMAGE_SIZE_PRESETS.find((item) => item.ratio === size)?.sizes["1K"];
    return parseImageSize(ratioSize || "") || fallback;
}
