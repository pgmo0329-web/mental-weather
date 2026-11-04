"use client";

import { useSyncExternalStore } from "react";
import { dateKey } from "./weather";

// 자정이 지나면 '오늘'이 바뀌도록 1분마다 다시 확인한다
function subscribe(listener: () => void) {
  const timer = setInterval(listener, 60_000);
  return () => clearInterval(timer);
}

const snapshot = () => dateKey(new Date());

export function useTodayKey() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function keyToDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
