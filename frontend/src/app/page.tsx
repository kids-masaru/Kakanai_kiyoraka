"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { analyzeAudioDirect, writeToSheets } from "@/lib/api";

type DocumentType = "assessment" | "service_meeting" | "management_meeting";

interface UploadState {
  status: "idle" | "uploading" | "analyzing" | "complete" | "error";
  progress: number;
  message: string;
  result?: Record<string, unknown>;
}

interface AssessmentFormData {
  受付対応者: string;
  アセスメント理由: string;
  アセスメント理由_備考: string;
  相談者氏名: string;
  続柄: string;
  実施場所: string;
  受付方法: string;
}

interface ManagementMeetingFormData {
  開催日: string;
  開催場所: string;
  参加者: string;
  開始時間: string;
  終了時間: string;
}

interface ServiceMeetingFormData {
  担当者名: string;
  利用者名: string;
  開催日: string;
  開催場所: string;
  開始時間: string;
  終了時間: string;
  開催回数: string;
}

interface Settings {
  assessmentSheetId: string;
  serviceMeetingSheetId: string;
  managementMeetingSheetId: string;
  geminiModel: string;
}

// Spreadsheet IDs from environment variables (Vercel) with fallbacks
const DEFAULT_SETTINGS: Settings = {
  assessmentSheetId: process.env.NEXT_PUBLIC_ASSESSMENT_SHEET_ID || "", // Assessment uses template now
  serviceMeetingSheetId: process.env.NEXT_PUBLIC_SERVICE_MEETING_SHEET_ID || "1ufwuCz0dCxiqL6PmlpqziD82lvaVI4ucong13NAY7Wg",
  managementMeetingSheetId: process.env.NEXT_PUBLIC_MANAGEMENT_MEETING_SHEET_ID || "1SlRGB0NVaTm_AoAyR4hqsA8b1rNz95fbUUELs0o-yI8",
  geminiModel: process.env.NEXT_PUBLIC_GEMINI_MODEL || "gemini-3-flash-preview",
};

const documentTypes: { value: DocumentType; label: string }[] = [
  { value: "assessment", label: "アセスメントシート" },
  { value: "service_meeting", label: "サービス担当者会議録" },
  { value: "management_meeting", label: "運営会議録" }
];

const assessmentReasonOptions = ["初回", "更新", "区分変更（改善）", "区分変更（悪化）", "退院", "対処", "サービス追加", "サービス変更"];
const relationshipOptions = ["本人", "家族", "配偶者", "子", "兄弟姉妹", "親", "その他"];
const locationOptions = ["自宅", "病院", "施設", "その他"];
const receptionMethodOptions = ["来所", "電話", "訪問", "その他"];
const meetingCountOptions = ["第1回", "第2回", "第3回", "第4回", "第5回", "第6回", "第7回", "第8回", "第9回", "第10回"];
const timeOptions = Array.from({ length: 25 }, (_, i) => `${String(i).padStart(2, '0')}:00`).concat(
  Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:30`)
).sort();
const geminiModels = ["gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.0-flash"];

// SVG Icons
const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const UploadIcon = () => (
  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

export default function Home() {
  const [selectedType, setSelectedType] = useState<DocumentType>("assessment");
  const [file, setFile] = useState<File | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: "idle",
    progress: 0,
    message: "",
  });

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

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

  // Drag and Drop handlers
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      // 許容するファイルタイプ: Audio, PDF, Image
      const type = droppedFile.type;
      if (type.startsWith('audio/') || type === 'application/pdf' || type.startsWith('image/')) {
        setFile(droppedFile);
        setUploadState({ status: "idle", progress: 0, message: "" });
      } else {
        alert("対応していないファイル形式です。(音声, PDF, 画像のみ対応)");
      }
    }
  }, []);

  const getFormData = () => {
    switch (selectedType) {
      case "assessment": return assessmentForm;
      case "management_meeting": return managementForm;
      case "service_meeting": return serviceForm;
    }
  };

  const getCurrentSpreadsheetId = () => {
    switch (selectedType) {
      case "assessment": return settings.assessmentSheetId; // Note: For 'create' mode, this might be ignored generally, but passed anyway
      case "service_meeting": return settings.serviceMeetingSheetId;
      case "management_meeting": return settings.managementMeetingSheetId;
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    try {
      setUploadState({ status: "uploading", progress: 20, message: "アップロード中..." });

      setUploadState({ status: "analyzing", progress: 50, message: "AI分析中...（大きなファイルは時間がかかります）" });

      // 分析タイプを決定
      const analysisType = selectedType === "assessment" ? "assessment" :
        selectedType === "management_meeting" ? "management_meeting" : "service_meeting";

      // ユニバーサルアップロードAPIを使用
      const result = await analyzeAudioDirect(file, analysisType);

      if (result.success) {
        setUploadState({ status: "complete", progress: 100, message: "分析完了！", result: { ...result.data, formInput: getFormData(), spreadsheetId: getCurrentSpreadsheetId() } });
      } else {
        throw new Error(result.error || "分析に失敗しました");
      }
    } catch (error) {
      setUploadState({ status: "error", progress: 0, message: error instanceof Error ? error.message : "エラーが発生しました" });
    }
  };

  const resetUpload = () => {
    setFile(null);
    setUploadState({ status: "idle", progress: 0, message: "" });
  };

  const handleWrite = async () => {
    try {
      setUploadState(prev => ({ ...prev, message: "スプレッドシートに書き込み中..." }));

      let writeMode: 'mapping' | 'append' | 'create' = 'mapping';
      let meetingType = "";

      if (selectedType === "assessment") {
        writeMode = "create"; // アセスメントは新規シート作成
      } else if (selectedType === "management_meeting") {
        writeMode = "append";
        meetingType = "management_meeting";
      } else if (selectedType === "service_meeting") {
        writeMode = "append";
        meetingType = "service_meeting";
      }

      // 追記データ用
      const meetingDate = selectedType === "management_meeting" ? managementForm.開催日 : serviceForm.開催日;
      const meetingTime = selectedType === "management_meeting" ? `${managementForm.開始時間}~${managementForm.終了時間}` : `${serviceForm.開始時間}~${serviceForm.終了時間}`;
      const meetingPlace = selectedType === "management_meeting" ? managementForm.開催場所 : serviceForm.開催場所;
      const meetingParticipants = selectedType === "management_meeting" ? managementForm.参加者 : serviceForm.担当者名; // サービス会議は担当者名を使用

      const result = await writeToSheets(
        getCurrentSpreadsheetId(),
        "",  // 空の場合はデフォルト
        uploadState.result || {},
        "assessment", // mappingType (ignored for append/create mostly)
        writeMode,
        meetingType,
        meetingDate,
        meetingTime,
        meetingPlace,
        meetingParticipants
      );

      if (result.success) {
        let msg = `✅ 書き込み完了（${result.data?.written_cells || 1}件）`;
        if (result.data?.sheet_url) {
          msg += ` URL: ${result.data.sheet_url}`;
          // URLを新しいタブで開く
          window.open(result.data.sheet_url, '_blank');
        }
        setUploadState(prev => ({ ...prev, status: "complete", message: msg }));
      } else {
        throw new Error(result.error || "書き込みに失敗しました");
      }
    } catch (error) {
      setUploadState(prev => ({ ...prev, message: `❌ 書き込みエラー: ${error instanceof Error ? error.message : '不明なエラー'}` }));
    }
  };

  const renderFormByType = () => {
    switch (selectedType) {
      case "assessment":
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">受付対応者</label>
              <input type="text" value={assessmentForm.受付対応者} onChange={(e) => setAssessmentForm({ ...assessmentForm, 受付対応者: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" placeholder="山田太郎" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">アセスメント理由</label>
              <select value={assessmentForm.アセスメント理由} onChange={(e) => setAssessmentForm({ ...assessmentForm, アセスメント理由: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                {assessmentReasonOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">相談者氏名</label>
              <input type="text" value={assessmentForm.相談者氏名} onChange={(e) => setAssessmentForm({ ...assessmentForm, 相談者氏名: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" placeholder="鈴木花子" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">続柄</label>
              <select value={assessmentForm.続柄} onChange={(e) => setAssessmentForm({ ...assessmentForm, 続柄: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                {relationshipOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">実施場所</label>
              <select value={assessmentForm.実施場所} onChange={(e) => setAssessmentForm({ ...assessmentForm, 実施場所: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                {locationOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">受付方法</label>
              <select value={assessmentForm.受付方法} onChange={(e) => setAssessmentForm({ ...assessmentForm, 受付方法: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                {receptionMethodOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
              <input type="text" value={assessmentForm.アセスメント理由_備考} onChange={(e) => setAssessmentForm({ ...assessmentForm, アセスメント理由_備考: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" placeholder="備考があれば入力" />
            </div>
          </div>
        );
      case "management_meeting":
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開催日</label>
              <input type="date" value={managementForm.開催日} onChange={(e) => setManagementForm({ ...managementForm, 開催日: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開催場所</label>
              <input type="text" value={managementForm.開催場所} onChange={(e) => setManagementForm({ ...managementForm, 開催場所: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" placeholder="会議室" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開始</label>
              <select value={managementForm.開始時間} onChange={(e) => setManagementForm({ ...managementForm, 開始時間: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                {timeOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">終了</label>
              <select value={managementForm.終了時間} onChange={(e) => setManagementForm({ ...managementForm, 終了時間: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                {timeOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">参加者</label>
              <input type="text" value={managementForm.参加者} onChange={(e) => setManagementForm({ ...managementForm, 参加者: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" placeholder="例: 井﨑、武島、〇〇" />
            </div>
          </div>
        );
      case "service_meeting":
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">担当者名</label>
              <input type="text" value={serviceForm.担当者名} onChange={(e) => setServiceForm({ ...serviceForm, 担当者名: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" placeholder="山田太郎" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">利用者名</label>
              <input type="text" value={serviceForm.利用者名} onChange={(e) => setServiceForm({ ...serviceForm, 利用者名: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" placeholder="鈴木花子" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開催日</label>
              <input type="date" value={serviceForm.開催日} onChange={(e) => setServiceForm({ ...serviceForm, 開催日: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開催場所</label>
              <select value={serviceForm.開催場所} onChange={(e) => setServiceForm({ ...serviceForm, 開催場所: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                {locationOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開始</label>
              <select value={serviceForm.開始時間} onChange={(e) => setServiceForm({ ...serviceForm, 開始時間: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                {timeOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">終了</label>
              <select value={serviceForm.終了時間} onChange={(e) => setServiceForm({ ...serviceForm, 終了時間: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                {timeOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開催回数</label>
              <select value={serviceForm.開催回数} onChange={(e) => setServiceForm({ ...serviceForm, 開催回数: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                {meetingCountOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Settings Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-xl transform transition-transform duration-300 ${showSettings ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">設定</h2>
          <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 rounded">
            <CloseIcon />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Geminiモデル</label>
            <select value={settings.geminiModel} onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              {geminiModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">アセスメントシートID</label>
            <p className="text-xs text-gray-500 mb-1">※新規作成モードのため現在は使用されません</p>
            <input type="text" value={settings.assessmentSheetId} onChange={(e) => setSettings({ ...settings, assessmentSheetId: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xs" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">サービス担当者会議ID</label>
            <input type="text" value={settings.serviceMeetingSheetId} onChange={(e) => setSettings({ ...settings, serviceMeetingSheetId: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xs" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">運営会議ID</label>
            <input type="text" value={settings.managementMeetingSheetId} onChange={(e) => setSettings({ ...settings, managementMeetingSheetId: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xs" />
          </div>
        </div>
      </div>

      {/* Overlay */}
      {showSettings && <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowSettings(false)} />}

      {/* Main Content */}
      <div className="flex-1">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/icon.jpg" alt="カカナイ" className="w-9 h-9 rounded-lg" />
              <h1 className="text-lg font-bold text-gray-900">介護DX カカナイ</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/genogram" className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">ジェノグラム</Link>
              <Link href="/body-map" className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">身体図</Link>
              <Link href="/house-plan" className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">家屋図</Link>
              <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 ml-2" title="設定">
                <SettingsIcon />
              </button>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="max-w-5xl mx-auto px-4 py-4">
          {/* Document Type Selection - Compact, no checkmark */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700 mr-2">作成:</span>
              {documentTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedType === type.value
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Form Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">基本情報</h3>
            {renderFormByType()}
          </div>

          {/* Upload Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">ファイル分析（音声・PDF・画像）</h3>

            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors mb-3 ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input type="file" accept="audio/*,.m4a,.mp3,.wav,application/pdf,image/*,.jpg,.jpeg,.png" onChange={handleFileChange} className="hidden" id="file-input" />
              <label htmlFor="file-input" className="cursor-pointer flex flex-col items-center">
                <UploadIcon />
                <p className="text-sm text-gray-500 mt-2">{isDragging ? 'ここにドロップ' : 'クリックまたはドラッグ&ドロップ'}</p>
                <p className="text-xs text-gray-400">音声(m4a/mp3), PDF, 画像(jpg/png) に対応</p>
              </label>
            </div>

            {file && (
              <div className="p-2 bg-blue-50 rounded-lg flex items-center gap-2 mb-3 text-sm">
                <span className="text-blue-600">●</span>
                <span className="flex-1 truncate">{file.name}</span>
                <span className="text-gray-500">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
                <button onClick={resetUpload} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!file || uploadState.status === "uploading" || uploadState.status === "analyzing"}
              className="w-full py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {uploadState.status === "uploading" || uploadState.status === "analyzing"
                ? uploadState.message
                : `${documentTypes.find(t => t.value === selectedType)?.label}を作成`}
            </button>

            {(uploadState.status === "uploading" || uploadState.status === "analyzing") && (
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadState.progress}%` }} />
                </div>
              </div>
            )}

            {uploadState.status === "error" && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{uploadState.message}</div>
            )}

            {uploadState.status === "complete" && uploadState.result && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-800 mb-2">分析結果</h4>
                <div className="bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto mb-3">
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap">{JSON.stringify(uploadState.result, null, 2)}</pre>
                </div>
                <button
                  onClick={handleWrite}
                  className="w-full py-3 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-all mb-2"
                >
                  📊 スプレッドシートに書き込み
                </button>
                {uploadState.message && uploadState.message.includes("書き込み") && (
                  <div className={`p-2 rounded-lg text-sm ${uploadState.message.includes("✅") ? "bg-green-50 text-green-700" : uploadState.message.includes("❌") ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>
                    {uploadState.message}
                  </div>
                )}
                <button onClick={resetUpload} className="mt-3 w-full py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200">別のファイルを分析</button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
