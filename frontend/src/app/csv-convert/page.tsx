"use client";

import { useState } from "react";
import Link from "next/link";

// Icons
const FileTextIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

const BookOpenIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
);

const UploadIcon = () => (
    <svg className="w-12 h-12 text-blue-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
);

const DownloadIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);


export default function CsvConvertPage() {
    const [file, setFile] = useState<File | null>(null);
    const [isConverting, setIsConverting] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setErrorMsg("");
            setSuccessMsg("");
        }
    };

    const handleConvert = async () => {
        if (!file) return;

        setIsConverting(true);
        setErrorMsg("");
        setSuccessMsg("");

        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/csv/convert`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.json();
                throw new Error(errorText.detail || "変換に失敗しました");
            }

            // Download handling
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            // Get filename from header or fallback
            const contentDisposition = response.headers.get("Content-Disposition");
            let filename = "converted.xlsx";
            if (contentDisposition) {
                const match = contentDisposition.match(/filename=(.+)/);
                if (match && match[1]) filename = match[1];
            }

            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();

            setSuccessMsg("変換完了！ダウンロードされました");
        } catch (err: any) {
            setErrorMsg(err.message);
        } finally {
            setIsConverting(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            {/* Header (Replicated for consistency) */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
                    <Link href="/" className="flex flex-col items-center justify-center gap-0 w-auto flex-shrink-0 hover:opacity-80 transition-opacity">
                        <img src="/icon.jpg" alt="カカナイ" className="w-8 h-8 rounded-lg" />
                        <h1 className="text-[10px] font-bold text-gray-900 leading-none mt-0.5 whitespace-nowrap">カカナイ</h1>
                    </Link>

                    <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar min-w-0 px-1">
                        <Link href="/genogram" className="whitespace-nowrap px-2 py-1.5 text-xs md:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition-colors flex-shrink-0">ジェノグラム</Link>
                        <Link href="/body-map" className="whitespace-nowrap px-2 py-1.5 text-xs md:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition-colors flex-shrink-0">身体図</Link>
                        <Link href="/house-plan" className="whitespace-nowrap px-2 py-1.5 text-xs md:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition-colors flex-shrink-0">家屋図</Link>
                        <div className="whitespace-nowrap px-2 py-1.5 text-xs md:text-sm font-medium text-white bg-blue-600 border border-blue-600 rounded-lg shadow-sm flex items-center gap-1 flex-shrink-0">
                            <FileTextIcon className="w-3 h-3" />
                            <span>CSV変換</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0 border-l border-gray-200 pl-2">
                        {/* No settings needed for this page */}
                        <button onClick={() => alert('マニュアル')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 flex-shrink-0" title="マニュアル">
                            <BookOpenIcon />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 py-8 flex-1 w-full">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
                    <h2 className="text-xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                        <FileTextIcon className="w-6 h-6 text-blue-500" />
                        CSV to Excel Converter
                    </h2>
                    <p className="text-sm text-gray-500 mb-8">
                        CSVファイルをアップロードすると、所定のExcelテンプレートにデータを貼り付けて出力します。
                    </p>

                    <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${file ? 'border-blue-500 bg-blue-50' : 'border-blue-200 hover:border-blue-400 hover:bg-gray-50'}`}>
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            className="hidden"
                            id="csv-upload"
                        />

                        {file ? (
                            <div className="flex flex-col items-center">
                                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-3">
                                    <span className="text-xl font-bold">CSV</span>
                                </div>
                                <p className="font-medium text-gray-900 mb-1">{file.name}</p>
                                <p className="text-xs text-gray-500 mb-4">{(file.size / 1024).toFixed(1)} KB</p>

                                <label
                                    htmlFor="csv-upload"
                                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                                >
                                    別のファイルを選択
                                </label>
                            </div>
                        ) : (
                            <label htmlFor="csv-upload" className="flex flex-col items-center cursor-pointer">
                                <UploadIcon />
                                <span className="text-base font-medium text-gray-700 mb-1">CSVファイルをアップロード</span>
                                <span className="text-xs text-gray-400">クリックしてファイルを選択</span>
                            </label>
                        )}
                    </div>

                    {errorMsg && (
                        <div className="mt-4 p-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200 flex items-start gap-2">
                            <span className="text-lg">⚠</span>
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {successMsg && (
                        <div className="mt-4 p-4 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200 flex items-center gap-2">
                            <span className="text-lg">✅</span>
                            <span>{successMsg}</span>
                        </div>
                    )}

                    <div className="mt-8 flex justify-center">
                        <button
                            onClick={handleConvert}
                            disabled={!file || isConverting}
                            className={`
                        w-full md:w-auto px-8 py-3 rounded-xl font-bold text-white shadow-md transition-all
                        flex items-center justify-center gap-2
                        ${!file || isConverting
                                    ? 'bg-gray-300 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 hover:shadow-lg transform hover:-translate-y-0.5'
                                }
                    `}
                        >
                            {isConverting ? (
                                <>
                                    <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                                    <span>変換中...</span>
                                </>
                            ) : (
                                <>
                                    <DownloadIcon />
                                    <span>Excelに変換してダウンロード</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <div className="text-center mt-8 space-y-2">
                    <p className="text-xs text-gray-400">
                        ※ 変換処理はすべてサーバー上で行われ、データは保存されません。
                    </p>
                    <p className="text-xs text-gray-400">
                        Supports: UTF-8, Shift-JIS, EUC-JP
                    </p>
                </div>
            </main>
        </div>
    );
}
