'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// SVG Arrow Icon
const ArrowLeftIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
);

export default function Header() {
    const pathname = usePathname();

    // Get page title based on path
    const getTitle = () => {
        if (pathname.includes('genogram')) return 'ジェノグラム編集';
        if (pathname.includes('body-map')) return '身体図編集';
        if (pathname.includes('house-plan')) return '家屋図編集';
        return 'エディター';
    };

    return (
        <div className="fixed top-0 left-0 right-0 h-12 bg-white border-b border-gray-200 px-4 flex items-center justify-between shadow-sm z-50">
            <div className="flex items-center gap-3">
                <Link
                    href="/"
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                    <ArrowLeftIcon />
                    <span>カカナイに戻る</span>
                </Link>
                <div className="h-5 w-px bg-gray-300"></div>
                <span className="text-sm font-semibold text-gray-800">{getTitle()}</span>
            </div>
        </div>
    );
}
