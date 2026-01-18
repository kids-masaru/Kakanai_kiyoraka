"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

// Icons
const SettingsIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const BookOpenIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
);

const FileTextIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

interface HeaderProps {
    onOpenSettings?: () => void;
    showSettingsButton?: boolean;
}

export default function Header({ onOpenSettings, showSettingsButton = false }: HeaderProps) {
    const pathname = usePathname();

    const isActive = (path: string) => {
        if (path === '/' && pathname === '/') return true;
        if (path !== '/' && pathname?.startsWith(path)) return true;
        return false;
    };

    const linkBaseClass = "whitespace-nowrap px-3 py-2 text-xs md:text-sm font-medium rounded-lg shadow-sm transition-all flex items-center gap-1.5 flex-shrink-0 border";
    const activeClass = "bg-amber-50 text-amber-900 border-amber-200 ring-1 ring-amber-100";
    const inactiveClass = "bg-white text-gray-700 border-gray-300 hover:bg-gray-50";

    return (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
            <div className="max-w-5xl mx-auto px-2 md:px-4 py-3 flex items-center justify-between gap-2">
                {/* Left: Logo (Fixed) */}
                <Link href="/" className="flex flex-col items-center justify-center gap-0 w-auto flex-shrink-0 hover:opacity-80 transition-opacity">
                    <img src="/icon.jpg" alt="カカナイ" className="w-8 h-8 rounded-lg" />
                    <h1 className="text-[10px] font-bold text-gray-900 leading-none mt-0.5 whitespace-nowrap">カカナイ</h1>
                </Link>

                {/* Center: Tools (Scrollable) */}
                <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar min-w-0 px-1">
                    <Link href="/genogram" className={`${linkBaseClass} ${isActive('/genogram') ? activeClass : inactiveClass}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        <span>ジェノグラム</span>
                    </Link>
                    <Link href="/body-map" className={`${linkBaseClass} ${isActive('/body-map') ? activeClass : inactiveClass}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        <span>身体図</span>
                    </Link>
                    <Link href="/house-plan" className={`${linkBaseClass} ${isActive('/house-plan') ? activeClass : inactiveClass}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                        <span>家屋図</span>
                    </Link>
                    <Link href="/csv-convert" className={`${linkBaseClass} ${isActive('/csv-convert') ? activeClass : inactiveClass}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <span>CSV変換</span>
                    </Link>
                </div>

                {/* Right: System (Fixed) */}
                <div className="flex items-center gap-1 flex-shrink-0 border-l border-gray-200 pl-2">
                    <button onClick={() => alert('マニュアルを確認できます')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 flex-shrink-0" title="マニュアル">
                        <BookOpenIcon />
                    </button>
                    {showSettingsButton && (
                        <button onClick={onOpenSettings} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 flex-shrink-0" title="設定">
                            <SettingsIcon />
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
}
