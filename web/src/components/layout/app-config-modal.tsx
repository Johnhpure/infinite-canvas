"use client";

import { App, Button, Form, Input, Modal, Select, Switch } from "antd";
import { useEffect, useState } from "react";
import { ReloadOutlined } from "@ant-design/icons";

import { ModelPicker } from "@/components/model-picker";
import { fetchUserConfig, measureUserStorageProvider, syncUserModelConfig, syncUserStorageProvider } from "@/services/api/user-config";
import { defaultUserStorageProvider, saveUserStorageProvider, USER_STORAGE_PROVIDER_KEY, type UserStorageProvider, clearStorageConfigCache as clearImageStorageCache } from "@/services/image-storage";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export function AppConfigModal() {
    const { message, modal } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const token = useUserStore((state) => state.token);
    const effectiveConfig = useEffectiveConfig();
    const modelChannel = publicSettings?.modelChannel;
    const storageSettings = publicSettings?.storage;
    const allowUserStorageProvider = storageSettings?.allowUserProvider === true;
    const modelConfig = effectiveConfig;
    const [userStorage, setUserStorage] = useState<UserStorageProvider>(() => defaultUserStorageProvider());
    const [measuringStorage, setMeasuringStorage] = useState(false);
    const [storageUsageText, setStorageUsageText] = useState("");
    const [saving, setSaving] = useState(false);
    const [migrating, setMigrating] = useState(false);
    const [migrationProgress, setMigrationProgress] = useState({ current: 0, total: 0 });

    useEffect(() => {
        try {
            setUserStorage({ ...defaultUserStorageProvider(), ...JSON.parse(window.localStorage.getItem(USER_STORAGE_PROVIDER_KEY) || "{}") });
        } catch {
            setUserStorage(defaultUserStorageProvider());
        }
        if (!isConfigOpen || !token) return;
        void fetchUserConfig(token)
            .then((payload) => {
                let syncModel = false;
                let syncStorage = false;
                if (payload.modelConfig) {
                    syncModel = !!payload.modelConfig.syncModelConfig;
                    syncStorage = !!payload.modelConfig.syncStorageConfig;

                    if (syncModel) {
                        Object.entries(payload.modelConfig).forEach(([key, value]) => updateConfig(key as keyof AiConfig, value as never));
                    } else {
                        updateConfig("syncModelConfig", false);
                    }

                    if (syncStorage) {
                        updateConfig("syncStorageConfig", true);
                    } else {
                        updateConfig("syncStorageConfig", false);
                    }
                } else {
                    updateConfig("syncModelConfig", false);
                    updateConfig("syncStorageConfig", false);
                }

                if (syncStorage && payload.storageProvider) {
                    const next = {
                        ...defaultUserStorageProvider(),
                        ...payload.storageProvider,
                        enabled: payload.storageProvider.enabled !== undefined ? payload.storageProvider.enabled : true,
                    };
                    setUserStorage(next);
                    saveUserStorageProvider(next);
                }
            })
            .catch(() => {});
    }, [isConfigOpen, token, updateConfig]);

    const finishConfig = async () => {
        if (allowUserStorageProvider) saveUserStorageProvider(userStorage);
        if (config.channelMode !== "remote") updateConfig("channelMode", "remote");

        const platformConfig = { ...config, channelMode: "remote" as const, apiKey: "", baseUrl: "", localChannels: [] };
        const isModelIncomplete = !modelConfig.imageModel.trim() || !modelConfig.textModel.trim();

        setSaving(true);
        try {
            if (token) {
                if (config.syncModelConfig) {
                    await syncUserModelConfig(token, platformConfig);
                } else {
                    await syncUserModelConfig(token, {
                        ...config,
                        channelMode: "remote",
                        syncModelConfig: false,
                        apiKey: "",
                        baseUrl: "",
                        localChannels: [],
                    });
                }
            }
            if (token && allowUserStorageProvider) {
                if (config.syncStorageConfig) {
                    await syncUserStorageProvider(token, userStorage);
                } else {
                    await syncUserStorageProvider(token, {
                        ...userStorage,
                        enabled: false,
                        endpoint: "",
                        bucket: "",
                        accessKeyId: "",
                        secretAccessKey: "",
                    });
                }
            }

            clearImageStorageCache();

            if (token) {
                const userConfig = await fetchUserConfig(token);
                const cloudSyncActive = userConfig.syncCapabilities?.userData === true && userConfig.syncCapabilities?.assets === true;

                if (cloudSyncActive) {
                    const { checkLocalAssetsExist, migrateLocalAssetsToCloud } = await import("@/services/storage-migration");
                    const hasLocalData = await checkLocalAssetsExist();
                    if (hasLocalData) {
                        const confirmMigration = await new Promise<boolean>((resolve) => {
                            modal.confirm({
                                title: "迁移本地资源到云端",
                                content: "检测到您之前有在浏览器本地离线保存的图片资产。是否现在一键将它们安全地迁移到刚刚配置的云端存储中？这样您在其他设备上也能正常查看它们。",
                                okText: "一键迁移",
                                cancelText: "暂不迁移",
                                onOk: () => resolve(true),
                                onCancel: () => resolve(false),
                            });
                        });

                        if (confirmMigration) {
                            setMigrating(true);
                            setMigrationProgress({ current: 0, total: 0 });
                            try {
                                await migrateLocalAssetsToCloud((current, total) => {
                                    setMigrationProgress({ current, total });
                                });
                                message.success("迁移成功！您的所有资产已安全地上传至云端并完成同步。");
                            } catch (migError) {
                                console.error("Migration error", migError);
                                message.error("资产迁移过程中遇到错误，请检查您的对象存储配置是否正确。");
                            } finally {
                                setMigrating(false);
                            }
                        }
                    }
                }
            }

            if (isModelIncomplete) {
                message.warning("默认模型尚未配置完整，配置已保存并同步");
            } else {
                message.success(shouldPromptContinue ? "配置已保存，请继续刚才的请求" : "配置已保存");
            }
            setConfigDialogOpen(false);
            clearPromptContinue();
        } catch (error) {
            message.error(error instanceof Error ? `同步配置失败：${error.message}` : "同步配置失败");
        } finally {
            setSaving(false);
        }
    };

    const measureStorage = async () => {
        if (!token) {
            message.warning("请先登录后再统计容量");
            return;
        }
        setMeasuringStorage(true);
        try {
            const result = await measureUserStorageProvider(token, userStorage);
            setStorageUsageText(`${formatStorageBytes(result.bytes)} / ${formatStorageBytes(result.limitBytes)}${result.overLimit ? "，已达到上限" : ""}`);
            if (result.overLimit) {
                const next = { ...userStorage, enabled: false };
                setUserStorage(next);
                saveUserStorageProvider(next);
            }
            message.success("容量统计完成");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "容量统计失败");
        } finally {
            setMeasuringStorage(false);
        }
    };

    return (
        <>
            <Modal
                title={
                    <div>
                        <div className="text-lg font-semibold">配置</div>
                        <div className="mt-1 text-xs font-normal text-stone-500">模型与生成参数</div>
                    </div>
                }
                open={isConfigOpen}
                width={760}
                centered
                onCancel={() => setConfigDialogOpen(false)}
                footer={
                    <Button type="primary" loading={saving} onClick={finishConfig}>
                        完成
                    </Button>
                }
            >
                <div className="pt-1">
                    <Form layout="vertical" requiredMark={false}>
                        <div className="mb-4 rounded-lg border border-stone-200 p-3 text-sm text-stone-500 dark:border-stone-800">
                            <div className="font-medium text-stone-900 dark:text-stone-100">Claude360 平台模型</div>
                            <div className="mt-1">当前账号通过 Claude360 APIKEY 调用平台接口，可用 {modelConfig.models.length || modelChannel?.availableModels.length || 0} 个模型。模型请求由服务端统一转发，不需要在本页面填写 Base URL 或模型 APIKEY。</div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <Form.Item label="默认生图模型" className="mb-4">
                                <ModelPicker
                                    config={modelConfig}
                                    value={modelConfig.imageModel}
                                    channelId={modelConfig.imageChannelId}
                                    onChange={(model, channelId) => {
                                        updateConfig("imageModel", model);
                                        if (channelId) updateConfig("imageChannelId", channelId);
                                    }}
                                    fullWidth
                                />
                            </Form.Item>
                            <Form.Item label="默认文本模型" className="mb-4">
                                <ModelPicker
                                    config={modelConfig}
                                    value={modelConfig.textModel}
                                    channelId={modelConfig.textChannelId}
                                    onChange={(model, channelId) => {
                                        updateConfig("textModel", model);
                                        if (channelId) updateConfig("textChannelId", channelId);
                                    }}
                                    fullWidth
                                />
                            </Form.Item>
                        </div>
                        <div className="grid gap-4 md:grid-cols-4">
                            <Form.Item label="生图 API 接口" className="mb-4">
                                <Select
                                    value={config.apiMode}
                                    onChange={(value) => updateConfig("apiMode", value)}
                                    options={[
                                        { label: "Image API (/v1/images)", value: "images" },
                                        { label: "Responses API (/v1/responses)", value: "responses" },
                                    ]}
                                />
                            </Form.Item>
                            <Form.Item label="请求超时（秒）" className="mb-4">
                                <Input value={config.timeout} inputMode="numeric" onChange={(event) => updateConfig("timeout", event.target.value)} />
                            </Form.Item>
                            <Form.Item label="失败重试次数" className="mb-4">
                                <Input value={config.retryAttempts} inputMode="numeric" onChange={(event) => updateConfig("retryAttempts", event.target.value)} />
                            </Form.Item>
                            <Form.Item label="请求中间步骤图像数" className="mb-4">
                                <Select
                                    value={config.streamPartialImages}
                                    disabled={!config.streamImages}
                                    onChange={(value) => updateConfig("streamPartialImages", value)}
                                    options={[
                                        { label: "0 张", value: "0" },
                                        { label: "1 张", value: "1" },
                                        { label: "2 张", value: "2" },
                                        { label: "3 张", value: "3" },
                                    ]}
                                />
                            </Form.Item>
                        </div>
                        <div className="mb-4 grid gap-3 md:grid-cols-3">
                            <FeatureSwitch title="流式传输" description="开启后请求中追加 stream，支持读取中间图片事件并避免长时间无数据。" checked={config.streamImages} onChange={(checked) => updateConfig("streamImages", checked)} />
                            <FeatureSwitch title="返回 Base64 图片数据" description="开启后 Image API 请求会追加 response_format: b64_json。" checked={config.responseFormatB64Json} onChange={(checked) => updateConfig("responseFormatB64Json", checked)} />
                            <FeatureSwitch title="Codex CLI 兼容模式" description="开启后减少不兼容参数，并追加防提示词改写前缀。" checked={config.codexCli} onChange={(checked) => updateConfig("codexCli", checked)} />
                        </div>
                        {allowUserStorageProvider ? (
                            <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/50">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-medium">用户 S3/R2 存储</div>
                                        <div className="mt-1 text-xs text-stone-500">开启后，新生成图片会优先保存到你自己的 S3 兼容对象存储。{storageUsageText ? `当前容量：${storageUsageText}` : ""}</div>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                        <Button size="small" loading={measuringStorage} onClick={() => void measureStorage()}>
                                            统计容量
                                        </Button>
                                        <span className="text-xs text-stone-500">自动同步</span>
                                        <Switch size="small" checked={config.syncStorageConfig} onChange={(checked) => updateConfig("syncStorageConfig", checked)} />
                                        <Switch checked={userStorage.enabled} onChange={(enabled) => setUserStorage((value) => ({ ...value, enabled }))} />
                                    </div>
                                </div>
                                {userStorage.enabled ? (
                                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                                        <Input value={userStorage.name} placeholder="配置名称" onChange={(event) => setUserStorage((value) => ({ ...value, name: event.target.value }))} />
                                        <Input value={userStorage.endpoint} placeholder="Endpoint，例如 https://<account>.r2.cloudflarestorage.com" onChange={(event) => setUserStorage((value) => ({ ...value, endpoint: event.target.value }))} />
                                        <Input value={userStorage.region} placeholder="Region，R2 通常为 auto" onChange={(event) => setUserStorage((value) => ({ ...value, region: event.target.value }))} />
                                        <Input value={userStorage.bucket} placeholder="Bucket 名称" onChange={(event) => setUserStorage((value) => ({ ...value, bucket: event.target.value }))} />
                                        <Input value={userStorage.accessKeyId} placeholder="Access Key ID" onChange={(event) => setUserStorage((value) => ({ ...value, accessKeyId: event.target.value }))} />
                                        <Input.Password value={userStorage.secretAccessKey} placeholder="Secret Access Key" onChange={(event) => setUserStorage((value) => ({ ...value, secretAccessKey: event.target.value }))} />
                                        <Input value={userStorage.publicBaseUrl} placeholder="公开访问地址，例如 https://pub-xxx.r2.dev" onChange={(event) => setUserStorage((value) => ({ ...value, publicBaseUrl: event.target.value }))} />
                                        <Input value={userStorage.pathPrefix} placeholder="保存路径前缀，例如 images" onChange={(event) => setUserStorage((value) => ({ ...value, pathPrefix: event.target.value }))} />
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </Form>
                </div>
            </Modal>
            <Modal open={migrating} footer={null} closable={false} mask={{ closable: false }} title="数据同步中" centered>
                <div className="flex flex-col items-center justify-center p-6 space-y-4">
                    <ReloadOutlined spin className="text-3xl text-blue-500" />
                    <span className="text-base font-medium">正在将本地图片资源安全地同步到云端存储...</span>
                    <span className="text-sm text-gray-500">
                        进度: {migrationProgress.current} / {migrationProgress.total} ({migrationProgress.total > 0 ? Math.round((migrationProgress.current / migrationProgress.total) * 100) : 0}
                        %)
                    </span>
                </div>
            </Modal>
        </>
    );
}

function FeatureSwitch({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <div className="rounded-lg border border-stone-200 px-3 py-2 dark:border-stone-800">
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{title}</div>
                <Switch checked={checked} onChange={onChange} />
            </div>
            <div className="mt-1 text-xs leading-5 text-stone-500">{description}</div>
        </div>
    );
}

function formatStorageBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}
