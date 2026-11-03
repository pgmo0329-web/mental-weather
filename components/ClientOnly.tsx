"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => {};

// 브라우저 저장소를 읽는 화면은 서버 렌더 없이 클라이언트에서만 그린다
export default function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  return isClient ? children : fallback;
}
