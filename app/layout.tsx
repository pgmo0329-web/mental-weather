import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import ClientOnly from "@/components/ClientOnly";
import Nav from "@/components/Nav";
import Toast from "@/components/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "SW학부 멘탈 기상청",
  description: "충북대 소프트웨어학부의 오늘 멘탈 날씨와 학년별 일정, 정보 공유",
};

export const viewport: Viewport = {
  themeColor: "#f2f4f6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* 루트 레이아웃이라 모든 페이지에 적용된다 */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Do+Hyeon&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full">
        <Suspense>
          <Nav />
        </Suspense>
        <main className="mx-auto max-w-md px-4 pb-28 pt-5 md:max-w-6xl md:px-8 md:pb-16 md:pt-24">{children}</main>
        <ClientOnly>
          <Toast />
        </ClientOnly>
      </body>
    </html>
  );
}
