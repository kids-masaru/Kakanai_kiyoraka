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

// Assessment form data
interface AssessmentFormData {
  受付対応者: string;
  アセスメント理由: string;
  アセスメント理由_備考: string;
  相談者氏名: string;
  続柄: string;
  実施場所: string;
  受付方法: string;
}

// Management meeting form data
interface ManagementMeetingFormData {
  開催日: string;
  開催場所: string;
  参加者: string;
  開始時間: string;
  終了時間: string;
}

// Service meeting form data
interface ServiceMeetingFormData {
  担当者名: string;
  利用者名: string;
  開催日: string;
  開催場所: string;
  開始時間: string;
  終了時間: string;
  開催回数: string;
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

// Dropdown options
const assessmentReasonOptions = ["初回", "更新", "区分変更（改善）", "区分変更（悪化）", "退院", "対処", "サービス追加", "サービス変更"];
const relationshipOptions = ["本人", "家族", "配偶者", "子", "兄弟姉妹", "親", "その他"];
const locationOptions = ["自宅", "病院", "施設", "その他"];
const receptionMethodOptions = ["来所", "電話", "訪問", "その他"];
const meetingCountOptions = ["第1回", "第2回", "第3回", "第4回", "第5回", "第6回", "第7回", "第8回", "第9回", "第10回"];
const timeOptions = Array.from({ length: 25 }, (_, i) => `${String(i).padStart(2, '0')}:00`).concat(
  Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:30`)
).sort();

export default function Home() {
  const [selectedType, setSelectedType] = useState<DocumentType>("assessment");
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
    progress: 0,
    message: "",
  });

  // Form states
  const [assessmentForm, setAssessmentForm] = useState<AssessmentFormData>({
    受付対応者: "",
    アセスメント理由: "初回",
    アセスメント理由_備考: "",
    相談者氏名: "",
    続柄: "本人",
    実施場所: "自宅",
    受付方法: "来所",
  });

  const [managementForm, setManagementForm] = useState<ManagementMeetingFormData>({
    開催日: new Date().toISOString().split('T')[0],
    開催場所: "会議室",
    参加者: "",
    開始時間: "10:00",
    終了時間: "11:00",
  });

  const [serviceForm, setServiceForm] = useState<ServiceMeetingFormData>({
    担当者名: "",
    利用者名: "",
    開催日: new Date().toISOString().split('T')[0],
    開催場所: "自宅",
    開始時間: "10:00",
    終了時間: "10:30",
    開催回数: "第1回",
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadState({ status: "idle", progress: 0, message: "" });
    }
  }, []);

  const getFormData = () => {
    switch (selectedType) {
      case "assessment":
        return assessmentForm;
      case "management_meeting":
        return managementForm;
      case "service_meeting":
        return serviceForm;
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setUploadState({
        status: "uploading",
        progress: 10,
        message: "署名付きURLを取得中...",
      });

      const { upload_url, file_key } = await getPresignedUrl(
        file.name,
        file.type || "audio/mp4"
      );

      setUploadState({
        status: "uploading",
        progress: 30,
        message: "R2にアップロード中...",
      });

      await uploadToR2(upload_url, file);

      setUploadState({
        status: "analyzing",
        progress: 60,
        message: "AI分析中...",
      });

      const analysisType = selectedType === "assessment" ? "assessment" : "meeting";
      const formData = getFormData();

      // Pass form data to backend for enhanced analysis
      const result = await analyzeAudio(file_key, analysisType);

      if (result.success) {
        // Merge form data with AI result
        const mergedData = {
          ...result.data,
          formInput: formData,
        };

        setUploadState({
          status: "complete",
          progress: 100,
          message: "分析完了！",
          result: mergedData,
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

  // Form renderers
  const renderAssessmentForm = () => (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
        📋 基本情報の入力
        <span className="text-xs text-gray-500 font-normal">※以下の項目は手入力でスプレッドシートに直接反映されます</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">受付対応者</label>
          <input
            type="text"
            value={assessmentForm.受付対応者}
            onChange={(e) => setAssessmentForm({ ...assessmentForm, 受付対応者: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="例: 山田太郎"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">アセスメント理由</label>
          <select
            value={assessmentForm.アセスメント理由}
            onChange={(e) => setAssessmentForm({ ...assessmentForm, アセスメント理由: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {assessmentReasonOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">相談者氏名</label>
          <input
            type="text"
            value={assessmentForm.相談者氏名}
            onChange={(e) => setAssessmentForm({ ...assessmentForm, 相談者氏名: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="例: 鈴木花子"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">アセスメント理由_備考</label>
          <input
            type="text"
            value={assessmentForm.アセスメント理由_備考}
            onChange={(e) => setAssessmentForm({ ...assessmentForm, アセスメント理由_備考: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="備考があれば入力"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">続柄</label>
          <select
            value={assessmentForm.続柄}
            onChange={(e) => setAssessmentForm({ ...assessmentForm, 続柄: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {relationshipOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">実施場所</label>
          <select
            value={assessmentForm.実施場所}
            onChange={(e) => setAssessmentForm({ ...assessmentForm, 実施場所: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {locationOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">受付方法</label>
          <select
            value={assessmentForm.受付方法}
            onChange={(e) => setAssessmentForm({ ...assessmentForm, 受付方法: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {receptionMethodOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );

  const renderManagementMeetingForm = () => (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
        📋 記録情報の入力（運営会議録）
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">開催日</label>
          <input
            type="date"
            value={managementForm.開催日}
            onChange={(e) => setManagementForm({ ...managementForm, 開催日: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">開催場所</label>
          <input
            type="text"
            value={managementForm.開催場所}
            onChange={(e) => setManagementForm({ ...managementForm, 開催場所: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="例: 会議室"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">参加者</label>
          <input
            type="text"
            value={managementForm.参加者}
            onChange={(e) => setManagementForm({ ...managementForm, 参加者: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="例: 井﨑、武島、〇〇"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">開催時間</label>
          <div className="flex items-center gap-2">
            <select
              value={managementForm.開始時間}
              onChange={(e) => setManagementForm({ ...managementForm, 開始時間: e.target.value })}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {timeOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <span className="text-gray-500">〜</span>
            <select
              value={managementForm.終了時間}
              onChange={(e) => setManagementForm({ ...managementForm, 終了時間: e.target.value })}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {timeOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  const renderServiceMeetingForm = () => (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
        📋 記録情報の入力（サービス担当者会議事録）
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">担当者名</label>
          <input
            type="text"
            value={serviceForm.担当者名}
            onChange={(e) => setServiceForm({ ...serviceForm, 担当者名: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="例: 山田太郎"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">開催場所</label>
          <select
            value={serviceForm.開催場所}
            onChange={(e) => setServiceForm({ ...serviceForm, 開催場所: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {locationOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">利用者名</label>
          <input
            type="text"
            value={serviceForm.利用者名}
            onChange={(e) => setServiceForm({ ...serviceForm, 利用者名: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="例: 鈴木花子"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">開催時間</label>
          <div className="flex items-center gap-2">
            <select
              value={serviceForm.開始時間}
              onChange={(e) => setServiceForm({ ...serviceForm, 開始時間: e.target.value })}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {timeOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <span className="text-gray-500">〜</span>
            <select
              value={serviceForm.終了時間}
              onChange={(e) => setServiceForm({ ...serviceForm, 終了時間: e.target.value })}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {timeOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">開催日</label>
          <input
            type="date"
            value={serviceForm.開催日}
            onChange={(e) => setServiceForm({ ...serviceForm, 開催日: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">開催回数</label>
          <select
            value={serviceForm.開催回数}
            onChange={(e) => setServiceForm({ ...serviceForm, 開催回数: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {meetingCountOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );

  const renderFormByType = () => {
    switch (selectedType) {
      case "assessment":
        return renderAssessmentForm();
      case "management_meeting":
        return renderManagementMeetingForm();
      case "service_meeting":
        return renderServiceMeetingForm();
    }
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

        {/* Dynamic Form Section */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          {renderFormByType()}
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
