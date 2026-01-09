"use client";

import { useState, useCallback } from "react";
import { getPresignedUrl, uploadToR2, analyzeAudio } from "@/lib/api";

type DocumentType = "assessment" | "service_meeting" | "management_meeting";

interface UploadState {
  status: "idle" | "uploading" | "analyzing" | "complete" | "error";
  progress: number;
  message: string;
  result?: Record<string, unknown>;
}

const documentTypes: { value: DocumentType; label: string; description: string; emoji: string }[] = [
  {
    value: "assessment",
    label: "アセスメントシート作成",
    description: "面談録音からアセスメント情報を抽出",
    emoji: "📝"
  },
  {
    value: "service_meeting",
    label: "サービス担当者会議録",
    description: "担当者会議の録音から会議録を作成",
    emoji: "👥"
  },
  {
    value: "management_meeting",
    label: "運営会議録",
    description: "運営会議の録音から会議録を作成",
    emoji: "📅"
  }
];

export default function Home() {
  const [selectedType, setSelectedType] = useState<DocumentType>("assessment");
  const [file, setFile] = useState<File | null>(null);
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

      // Map document type to analysis type
      const analysisType = selectedType === "assessment" ? "assessment" : "meeting";

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
    } catch (error) {
      setUploadState({
        status: "error",
        progress: 0,
        message: error instanceof Error ? error.message : "エラーが発生しました",
      });
    }
  };

  const resetUpload = () => {
    setFile(null);
    setUploadState({ status: "idle", progress: 0, message: "" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/icon.jpg"
              alt="カカナイ"
              className="w-12 h-12 rounded-xl shadow-sm"
            />
            <div>
              <h1 className="text-xl font-bold text-gray-900">介護DX カカナイ</h1>
              <p className="text-xs text-gray-500">帳票自動転記・AI分析</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* Document Type Selection */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            📋 作成する書類を選択
          </h2>
          <div className="grid gap-3">
            {documentTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                className={`p-4 rounded-xl border-2 text-left transition-all ${selectedType === type.value
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{type.emoji}</span>
                  <div>
                    <div className="font-medium text-gray-900">{type.label}</div>
                    <div className="text-sm text-gray-500">{type.description}</div>
                  </div>
                  {selectedType === type.value && (
                    <div className="ml-auto">
                      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm">✓</span>
                      </div>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* File Upload Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            🎤 音声ファイルをアップロード
          </h2>

          {/* File Upload Area */}
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors mb-4">
            <input
              type="file"
              accept="audio/*,.m4a,.mp3,.wav"
              onChange={handleFileChange}
              className="hidden"
              id="file-input"
            />
            <label htmlFor="file-input" className="cursor-pointer">
              <div className="text-4xl mb-3">📁</div>
              <p className="text-gray-600 mb-2">
                クリックしてファイルを選択
              </p>
              <p className="text-gray-400 text-sm">
                対応形式: M4A, MP3, WAV
              </p>
            </label>
          </div>

          {/* Selected File Info */}
          {file && (
            <div className="p-3 bg-blue-50 rounded-lg flex items-center gap-3 mb-4">
              <span className="text-2xl">🎵</span>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={resetUpload}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
          )}

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={!file || uploadState.status === "uploading" || uploadState.status === "analyzing"}
            className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-lg"
          >
            {uploadState.status === "uploading" || uploadState.status === "analyzing"
              ? uploadState.message
              : `📤 ${documentTypes.find(t => t.value === selectedType)?.label}を作成`}
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
              <button
                onClick={resetUpload}
                className="mt-4 w-full py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
              >
                🔄 別のファイルを分析
              </button>
            </div>
          )}
        </div>

        {/* Related Tools */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center gap-4 mb-6">
            <img
              src="/tools-icon.png"
              alt="関連ツール"
              className="w-16 h-16 rounded-xl"
            />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                関連ツール
              </h3>
              <p className="text-sm text-gray-500">ジェノグラム・身体図・家屋図エディター</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://genogram-editor.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
            >
              👨‍👩‍👧 ジェノグラム編集
            </a>
            <a
              href="https://genogram-editor.vercel.app/body-map"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors text-sm font-medium"
            >
              🩺 身体図編集
            </a>
            <a
              href="https://genogram-editor.vercel.app/house-plan"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium"
            >
              🏠 家屋図編集
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-gray-500 text-sm">
          © 2026 介護DX カカナイ
        </div>
      </footer>
    </div>
  );
}
