'use client';

import { Gender } from '@/lib/types';

interface ToolbarProps {
    onAddPerson: (gender: Gender) => void;
    onExportPng: () => void;
    onExportJson: () => void;
    onImportJson: () => void;
    onClear: () => void;
}

export default function Toolbar({
    onAddPerson,
    onExportPng,
    onExportJson,
    onImportJson,
    onClear,
}: ToolbarProps) {
    return (
        <div className="fixed top-4 left-4 z-50 bg-white rounded-lg shadow-lg p-3 flex flex-col gap-2 border border-gray-200">
            <div className="text-sm font-bold text-gray-700 mb-1">ノード追加</div>

            <button
                onClick={() => onAddPerson('M')}
                className="flex items-center gap-2 px-3 py-2 bg-blue-100 hover:bg-blue-200 rounded text-sm transition"
            >
                <span className="w-4 h-4 border-2 border-gray-700 bg-blue-50"></span>
                男性を追加
            </button>

            <button
                onClick={() => onAddPerson('F')}
                className="flex items-center gap-2 px-3 py-2 bg-pink-100 hover:bg-pink-200 rounded text-sm transition"
            >
                <span className="w-4 h-4 border-2 border-gray-700 bg-pink-50 rounded-full"></span>
                女性を追加
            </button>

            <button
                onClick={() => onAddPerson('U')}
                className="flex items-center gap-2 px-3 py-2 bg-green-100 hover:bg-green-200 rounded text-sm transition"
            >
                <span className="w-3 h-3 border-2 border-gray-700 bg-green-50 rotate-45"></span>
                不明を追加
            </button>

            <hr className="my-2" />

            <div className="text-sm font-bold text-gray-700 mb-1">ファイル</div>

            <button
                onClick={onExportPng}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm transition"
            >
                📷 PNG出力
            </button>

            <button
                onClick={onExportJson}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm transition"
            >
                💾 JSON保存
            </button>

            <button
                onClick={onImportJson}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm transition"
            >
                📂 JSON読込
            </button>

            <hr className="my-2" />

            <button
                onClick={onClear}
                className="px-3 py-2 bg-red-100 hover:bg-red-200 rounded text-sm text-red-700 transition"
            >
                🗑️ クリア
            </button>
        </div>
    );
}
