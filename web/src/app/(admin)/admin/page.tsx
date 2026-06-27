"use client";

import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { App, Button, Form, Input } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { adminLogin } from "@/services/api/auth";
import { useSiteInfo } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

type AdminLoginFormValues = {
    username: string;
    password: string;
};

function safeRedirect(value: string | null): string {
    const cleaned = (value ?? "").replace(/[\t\n\r]/g, "");
    if (!cleaned.startsWith("/admin") || cleaned.startsWith("//") || cleaned.startsWith("/\\")) {
        return "/admin/users";
    }
    return cleaned === "/admin" ? "/admin/users" : cleaned;
}

export default function AdminPage() {
    return (
        <Suspense fallback={null}>
            <AdminLoginContent />
        </Suspense>
    );
}

function AdminLoginContent() {
    const { message } = App.useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const setSession = useUserStore((state) => state.setSession);
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const [form] = Form.useForm<AdminLoginFormValues>();
    const site = useSiteInfo();
    const redirect = safeRedirect(searchParams.get("redirect"));

    useEffect(() => {
        if (isReady && user?.role === "admin") router.replace(redirect);
    }, [isReady, redirect, router, user?.role]);

    const submit = async (values: AdminLoginFormValues) => {
        try {
            const session = await adminLogin(values);
            setSession(session.token, session.user);
            message.success("管理员登录成功");
            router.replace(redirect);
            router.refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "管理员登录失败");
        }
    };

    return (
        <main className="flex h-dvh min-h-0 items-center justify-center overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-10 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]">
            <section className="w-full max-w-[420px]">
                <div className="mb-7 text-center">
                    {site.logoUrl ? (
                        <img src={site.logoUrl} alt={site.name} className="mx-auto mb-4 block size-12 object-contain" />
                    ) : (
                        <span
                            className="mx-auto mb-4 block size-12 bg-stone-950 dark:bg-stone-100"
                            style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }}
                            aria-label={site.name}
                        />
                    )}
                    <h1 className="text-3xl font-semibold tracking-normal text-stone-950 dark:text-stone-100">管理员登录</h1>
                    <p className="mt-3 text-base leading-7 text-stone-500 dark:text-stone-400">使用管理员账号和密码进入后台。</p>
                </div>

                <Form<AdminLoginFormValues> form={form} layout="vertical" size="large" requiredMark={false} onFinish={submit}>
                    <Form.Item name="username" label={<span className="font-medium text-stone-800 dark:text-stone-200">管理员账号</span>} rules={[{ required: true, message: "请输入管理员账号" }]}>
                        <Input prefix={<UserOutlined />} autoComplete="username" />
                    </Form.Item>
                    <Form.Item name="password" label={<span className="font-medium text-stone-800 dark:text-stone-200">密码</span>} rules={[{ required: true, message: "请输入密码" }]}>
                        <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
                    </Form.Item>
                    <Button block type="primary" htmlType="submit">
                        登录管理后台
                    </Button>
                </Form>
            </section>
        </main>
    );
}
