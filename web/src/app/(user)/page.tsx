"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useUserStore } from "@/stores/use-user-store";

export default function IndexPage() {
    const router = useRouter();
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);

    useEffect(() => {
        if (!isReady) return;
        router.replace(user ? "/canvas" : "/login");
    }, [isReady, router, user]);

    return <main className="h-full bg-background" />;
}
