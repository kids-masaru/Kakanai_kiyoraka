"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { getPresignedUrl, uploadToR2, analyzeAudio, analyzePdf, analyzeImage } from "@/lib/api";

type AnalysisType = "assessment" | "meeting" | "qa";

interface UploadState {
    status: "idle" | "uploading" | "analyzing" | "complete" | "error";
    progress: number;
    message: string;
    result?: Record<string, unknown>;
}

export default function UploadPage() {
    const [file, setFile] = useState<File | null>(null);
    const [analysisType, setAnalysisType] = useState<AnalysisType>("assessment");
    const [uploadState, setUploadState] = useState<UploadState>({
        status: "idle",
        progress: 0,
        message: "",
    });

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setUploadState({ status: "idle", progress: 0, message: "" });
        }
    }, []);

    const handleUpload = async () => {
        if (!file) return;

        try {
            // Check if it's audio or PDF
            const isAudio = file.type.startsWith("audio/") ||
                file.name.toLowerCase().endsWith(".m4a") ||
                file.name.toLowerCase().endsWith(".mp3") ||
                file.name.toLowerCase().endsWith(".wav");

            const isPdf = file.type === "application/pdf" ||
                file.name.toLowerCase().endsWith(".pdf");

            const isImage = file.type.startsWith("image/") ||
                file.name.toLowerCase().endsWith(".jpg") ||
                file.name.toLowerCase().endsWith(".jpeg") ||
                file.name.toLowerCase().endsWith(".png");

            if (isAudio) {
                // Audio: Use R2 presigned URL upload
                setUploadState({
                    status: "uploading",
                    progress: 10,
                    message: "署名付きURLを取得中...",
                });

                // Get presigned URL
                const { upload_url, file_key } = await getPresignedUrl(
                    file.name,
                    file.type || "audio/mp4"
                );

                setUploadState({
                    status: "uploading",
                    progress: 30,
                    message: "R2にアップロード中...",
                });

                // Upload directly to R2
                await uploadToR2(upload_url, file);

                setUploadState({
                    status: "analyzing",
                    progress: 60,
                    message: "AI分析中...",
                });

                // Analyze the uploaded file
                const result = await analyzeAudio(file_key, analysisType);

                if (result.success) {
                    setUploadState({
                        status: "complete",
                        progress: 100,
                        message: "分析完了！",
                        result: result.data,
                    });
                } else {
                    throw new Error(result.error || "分析に失敗しました");
                }
            } else if (isPdf) {
                // PDF: Direct upload to backend
                setUploadState({
                    status: "uploading",
                    progress: 30,
                    message: "PDFをアップロード中...",
                });

                setUploadState({
                    status: "analyzing",
                    progress: 60,
                    message: "AI分析中...",
                });

                const result = await analyzePdf(file);

                if (result.success) {
                    setUploadState({
                        status: "complete",
                        progress: 100,
                        message: "分析完了！",
                        result: result.data,
                    });
                } else {
                    throw new Error(result.error || "分析に失敗しました");
                }
            } else if (isImage) {
                // Image: Direct upload to backend
                setUploadState({
                    status: "uploading",
                    progress: 30,
                    message: "画像をアップロード中...",
                });

                setUploadState({
                    status: "analyzing",
                    progress: 60,
                    message: "AI分析中...",
                });

                const result = await analyzeImage(file);

                if (result.success) {
                    setUploadState({
                        status: "complete",
                        progress: 100,
                        message: "分析完了！",
                        result: result.data,
                    });
                } else {
                    throw new Error(result.error || "分析に失敗しました");
                }
            } else {
                throw new Error("サポートされていないファイル形式です");
            }
        } catch (error) {
            setUploadState({
                status: "error",
                progress: 0,
                message: error instanceof Error ? error.message : "エラーが発生しました",
            });
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
            {/* Header */}
            <header className="bg-white shadow-sm border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <Link href="/" className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                                <span className="text-white text-xl">📋</span>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">カカナイ</h1>
                                <p className="text-xs text-gray-500">ファイルアップロード</p>
                            </div>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-3xl mx-auto px-4 py-8">
                <div className="bg-white rounded-2xl shadow-lg p-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">
                        🎤 ファイルアップロード
                    </h2>

                    {/* Analysis Type Selection */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            分析タイプ
                        </label>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setAnalysisType("assessment")}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${analysisType === "assessment"
                                    ? "bg-blue-500 text-white"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                    }`}
                            >
                                📝 アセスメント
                            </button>
                            <button
                                onClick={() => setAnalysisType("meeting")}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${analysisType === "meeting"
                                    ? "bg-purple-500 text-white"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                    }`}
                            >
                                📅 会議録
                            </button>
                            <button
                                onClick={() => setAnalysisType("qa")}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${analysisType === "qa"
                                    ? "bg-green-500 text-white"
                                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                    }`}
                            >
                                ❓ Q&A抽出
                            </button>
                        </div>
                    </div>

                    {/* File Upload Area */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            ファイル選択
                        </label>
                        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
                            <input
                                type="file"
                                accept="audio/*,.m4a,.mp3,.wav,.pdf,image/*,.jpg,.jpeg,.png"
                                onChange={handleFileChange}
                                className="hidden"
                                id="file-input"
                            />
                            <label
                                htmlFor="file-input"
                                className="cursor-pointer"
                            >
                                <div className="text-4xl mb-3">📁</div>
                                <p className="text-gray-600 mb-2">
                                    クリックしてファイルを選択
                                </p>
                                <p className="text-gray-400 text-sm">
                                    対応形式: M4A, MP3, WAV, PDF, JPEG, PNG
                                </p>
                            </label>
                        </div>
                        {file && (
                            <div className="mt-3 p-3 bg-blue-50 rounded-lg flex items-center gap-3">
                                <span className="text-2xl">
                                    {file.type.startsWith("audio/") ? "🎵" : file.type.startsWith("image/") ? "🖼️" : "📄"}
                                </span>
                                <div>
                                    <p className="font-medium text-gray-900">{file.name}</p>
                                    <p className="text-sm text-gray-500">
                                        {(file.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Upload Button */}
                    <button
                        onClick={handleUpload}
                        disabled={!file || uploadState.status === "uploading" || uploadState.status === "analyzing"}
                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {uploadState.status === "uploading" || uploadState.status === "analyzing"
                            ? uploadState.message
                            : "📤 アップロード & 分析開始"}
                    </button>

                    {/* Progress Bar */}
                    {(uploadState.status === "uploading" || uploadState.status === "analyzing") && (
                        <div className="mt-4">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${uploadState.progress}%` }}
                                />
                            </div>
                            <p className="text-sm text-gray-500 mt-2 text-center">
                                {uploadState.message}
                            </p>
                        </div>
                    )}

                    {/* Error Message */}
                    {uploadState.status === "error" && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                            <p className="text-red-700">❌ {uploadState.message}</p>
                        </div>
                    )}

                    {/* Result */}
                    {uploadState.status === "complete" && uploadState.result && (
                        <div className="mt-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-3">
                                ✅ 分析結果
                            </h3>
                            <div className="bg-gray-50 rounded-xl p-4 max-h-96 overflow-y-auto">
                                <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                                    {JSON.stringify(uploadState.result, null, 2)}
                                </pre>
                            </div>
                            <div className="mt-4 flex gap-3">
                                <Link
                                    href="/assessment"
                                    className="flex-1 py-2 bg-green-500 text-white text-center font-medium rounded-lg hover:bg-green-600 transition-colors"
                                >
                                    📝 アセスメント作成へ
                                </Link>
                                <button
                                    onClick={() => {
                                        setFile(null);
                                        setUploadState({ status: "idle", progress: 0, message: "" });
                                    }}
                                    className="flex-1 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
                                >
                                    🔄 別のファイルを分析
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
