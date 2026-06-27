"use client";

import { KeyOutlined } from "@ant-design/icons";
import { App, Button, Form, Input } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useConfigStore, useSiteInfo } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type LoginFormValues = {
    apiKey: string;
};

function safeRedirect(value: string | null): string {
    const cleaned = (value ?? "").replace(/[\t\n\r]/g, "");
    if (!cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.startsWith("/\\")) {
        return "/canvas";
    }
    return cleaned;
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginContent />
        </Suspense>
    );
}

function LoginContent() {
    const { message } = App.useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const loginWithClaude360APIKey = useUserStore((state) => state.loginWithClaude360APIKey);
    const isLoading = useUserStore((state) => state.isLoading);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const site = useSiteInfo();
    const redirect = safeRedirect(searchParams.get("redirect"));

    const submit = async (values: LoginFormValues) => {
        try {
            const session = await loginWithClaude360APIKey(values.apiKey);
            const models = session.models || [];
            const imageModel = models.includes("gpt-image-2") ? "gpt-image-2" : models[0] || "gpt-image-2";
            const textModel = models.includes("gpt-5.5") ? "gpt-5.5" : models.find((model) => !model.toLowerCase().includes("image")) || models[0] || "";
            updateConfig("channelMode", "remote");
            updateConfig("models", models);
            updateConfig("publicChannels", [{ id: "claude360-platform", protocol: "openai", name: "Claude360 平台模型", baseUrl: "", models, weight: 1, timeout: 600, enabled: true, remark: "" }]);
            updateConfig("imageChannelId", "claude360-platform");
            updateConfig("textChannelId", "claude360-platform");
            updateConfig("activeChannelId", "");
            updateConfig("imageModel", imageModel);
            updateConfig("model", imageModel);
            if (textModel) updateConfig("textModel", textModel);
            message.success("登录成功");
            router.replace(redirect);
            router.refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        }
    };

    return (
        <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-10 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]">
            <section className="w-full max-w-[440px]">
                <div className="mb-7 text-center">
                    {site.logoUrl ? (
                        <img src={site.logoUrl} alt={site.name} className="mx-auto mb-4 block size-12 object-contain" />
                    ) : (
                        <span
                            className="mx-auto mb-4 block size-12 bg-stone-950 dark:bg-stone-100"
                            style={{
                                mask: "url(/logo.svg) center / contain no-repeat",
                                WebkitMask: "url(/logo.svg) center / contain no-repeat",
                            }}
                            aria-label={site.name}
                        />
                    )}
                    <h1 className="text-3xl font-semibold tracking-normal text-stone-950 dark:text-stone-100">使用 Claude360 APIKEY 登录</h1>
                    <p className="mt-3 text-base leading-7 text-stone-500 dark:text-stone-400">请输入你在 claude360 创建的 APIKEY，即可进入媒体创作工作台。</p>
                </div>

                <Form<LoginFormValues> layout="vertical" size="large" requiredMark={false} onFinish={submit}>
                    <Form.Item name="apiKey" label={<span className="font-medium text-stone-800 dark:text-stone-200">Claude360 APIKEY</span>} rules={[{ required: true, message: "请输入 Claude360 APIKEY" }]}>
                        <Input.Password prefix={<KeyOutlined />} autoComplete="off" placeholder="sk-..." />
                    </Form.Item>
                    <Button block type="primary" htmlType="submit" loading={isLoading}>
                        登录媒体创作工作台
                    </Button>
                </Form>
            </section>
        </main>
    );
}
