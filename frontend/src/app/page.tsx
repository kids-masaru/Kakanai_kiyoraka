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
  const [showSettings, setShowSettings] = useState(false);

  // Multi-file state
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState<string>(""); // "analyzing", "writing", "complete", "error"
  const [processMessage, setProcessMessage] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [extractionResult, setExtractionResult] = useState<any>(null);

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

  // Helper to add files
  const addFiles = (newFiles: File[]) => {
    // 重複チェックは簡易的にファイル名で（同名ファイルが別の内容の可能性もあるが許容）
    const currentNames = new Set(files.map(f => f.name));
    const uniqueNewFiles = newFiles.filter(f => !currentNames.has(f.name));
    setFiles(prev => [...prev, ...uniqueNewFiles]);

    // ステータスリセット
    if (processStatus === "complete" || processStatus === "error") {
      setProcessStatus("");
      setProcessMessage("");
      setResultUrl(null);
    }
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
    e.target.value = "";
  }, [files, processStatus]);

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

    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = droppedFiles.filter(f => {
      const type = f.type;
      return type.startsWith('audio/') || type === 'application/pdf' || type.startsWith('image/');
    });

    if (validFiles.length > 0) {
      addFiles(validFiles);
    }

    if (droppedFiles.length !== validFiles.length) {
      alert("一部のファイルは対応していない形式のためスキップされました。(音声, PDF, 画像のみ対応)");
    }
  }, [files, processStatus]); // add files dependency

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    if (processStatus === "complete" || processStatus === "error") {
      setProcessStatus("");
      setProcessMessage("");
      setResultUrl(null);
      setExtractionResult(null);
    }
  };

  const getFormData = () => {
    switch (selectedType) {
      case "assessment": return assessmentForm;
      case "management_meeting": return managementForm;
      case "service_meeting": return serviceForm;
    }
  };

  const getCurrentSpreadsheetId = () => {
    switch (selectedType) {
      case "assessment": return settings.assessmentSheetId;
      case "service_meeting": return settings.serviceMeetingSheetId;
      case "management_meeting": return settings.managementMeetingSheetId;
    }
  };

  const handleProcess = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProcessStatus("analyzing");
    setProcessMessage(`AI分析中... (${files.length}件のファイルを統合中)`);
    setResultUrl(null);
    setExtractionResult(null);

    try {
      // 1. Analyze (All files at once)
      const analysisType = selectedType === "assessment" ? "assessment" :
        selectedType === "management_meeting" ? "management_meeting" : "service_meeting";

      const analyzeResult = await analyzeAudioDirect(files, analysisType);

      if (!analyzeResult.success) {
        throw new Error(analyzeResult.error || "分析失敗");
      }
      setExtractionResult(analyzeResult.data);

      // 2. Write
      setProcessStatus("writing");
      setProcessMessage("スプレッドシート書き込み中...");

      // Prepare write data
      let writeMode: 'mapping' | 'append' | 'create' = 'mapping';
      let meetingType = "";

      if (selectedType === "assessment") {
        writeMode = "create";
      } else if (selectedType === "management_meeting") {
        writeMode = "append";
        meetingType = "management_meeting";
      } else if (selectedType === "service_meeting") {
        writeMode = "append";
        meetingType = "service_meeting";
      }

      const meetingDate = selectedType === "management_meeting" ? managementForm.開催日 : serviceForm.開催日;
      const meetingTime = selectedType === "management_meeting" ? `${managementForm.開始時間}~${managementForm.終了時間}` : `${serviceForm.開始時間}~${serviceForm.終了時間}`;
      const meetingPlace = selectedType === "management_meeting" ? managementForm.開催場所 : serviceForm.開催場所;
      // Assessment has no participants field in this context
      let meetingParticipants = "";
      if (selectedType === "management_meeting") meetingParticipants = managementForm.参加者;
      if (selectedType === "service_meeting") meetingParticipants = serviceForm.担当者名;

      // Extract additional fields for Service Meeting
      const userName = selectedType === "service_meeting" ? serviceForm.利用者名 : "";
      const staffName = selectedType === "service_meeting" ? serviceForm.担当者名 : "";
      const meetingCount = selectedType === "service_meeting" ? serviceForm.開催回数 : "";

      // Extract additional fields for Assessment Sheet
      const consultantName = selectedType === "assessment" ? assessmentForm.相談者氏名 : "";
      const assessmentReason = selectedType === "assessment" ? assessmentForm.アセスメント理由 : "";
      const relationship = selectedType === "assessment" ? assessmentForm.続柄 : "";
      const assessmentPlace = selectedType === "assessment" ? assessmentForm.実施場所 : "";
      const receptionMethod = selectedType === "assessment" ? assessmentForm.受付方法 : "";

      // Note: "user_name" for assessment might come from the form too? 
      // The current form structure puts "Consultant Name" but usually Assessment involves a Target User.
      // However, looking at the interface, assessmentForm only has "相談者氏名" (Consultant/Applicant).
      // wait, "利用者情報_氏名_漢字" is usually extracted or input.
      // Let's rely on what's available. If "user name" is needed for assessment file naming,
      // the backend Logic for create_and_write_assessment looks for "利用者情報_氏名_漢字" or "氏名".
      // We will map consultantName to consultant_name.
      // If there is no specific field for "Target User Name" in the Assessment Form (UI), we can't send it yet.
      // Checking lines 109-117 (step 2343): assessmentForm has: 受付対応者, アセスメント理由, 相談者氏名, 続柄, 実施場所, 受付方法.
      // It DOES NOT have "利用者名" (Target User Name). 
      // So we will just pass what we have.

      const writeResult = await writeToSheets(
        getCurrentSpreadsheetId(),
        "",
        (analyzeResult.data || {}) as Record<string, unknown>,
        "assessment",
        writeMode,
        meetingType,
        meetingDate,
        meetingTime,
        meetingPlace,
        meetingParticipants,
        userName,
        staffName,
        meetingCount,
        consultantName,
        assessmentReason,
        relationship,
        assessmentPlace,
        receptionMethod
      );

      if (writeResult.success) {
        setProcessStatus("complete");
        setProcessMessage("✅ 完了しました");
        setResultUrl(writeResult.data?.sheet_url as string);

        if (writeResult.data?.sheet_url) {
          window.open(writeResult.data.sheet_url as string, '_blank');
        }
      } else {
        throw new Error(writeResult.error || "書き込み失敗");
      }

    } catch (error) {
      setProcessStatus("error");
      setProcessMessage(`❌ エラー: ${error instanceof Error ? error.message : "不明なエラー"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderFormByType = () => {
    switch (selectedType) {
      case "assessment":
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">受付対応者</label>
              <input type="text" value={assessmentForm.受付対応者} onChange={(e) => setAssessmentForm({ ...assessmentForm, 受付対応者: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900" placeholder="山田太郎" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">アセスメント理由</label>
              <select value={assessmentForm.アセスメント理由} onChange={(e) => setAssessmentForm({ ...assessmentForm, アセスメント理由: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900">
                {assessmentReasonOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">相談者氏名</label>
              <input type="text" value={assessmentForm.相談者氏名} onChange={(e) => setAssessmentForm({ ...assessmentForm, 相談者氏名: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900" placeholder="鈴木花子" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">続柄</label>
              <select value={assessmentForm.続柄} onChange={(e) => setAssessmentForm({ ...assessmentForm, 続柄: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900">
                {relationshipOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">実施場所</label>
              <select value={assessmentForm.実施場所} onChange={(e) => setAssessmentForm({ ...assessmentForm, 実施場所: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900">
                {locationOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">受付方法</label>
              <select value={assessmentForm.受付方法} onChange={(e) => setAssessmentForm({ ...assessmentForm, 受付方法: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900">
                {receptionMethodOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
              <input type="text" value={assessmentForm.アセスメント理由_備考} onChange={(e) => setAssessmentForm({ ...assessmentForm, アセスメント理由_備考: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900" placeholder="備考があれば入力" />
            </div>
          </div>
        );
      case "management_meeting":
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開催日</label>
              <input type="date" value={managementForm.開催日} onChange={(e) => setManagementForm({ ...managementForm, 開催日: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開催場所</label>
              <input type="text" value={managementForm.開催場所} onChange={(e) => setManagementForm({ ...managementForm, 開催場所: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900" placeholder="会議室" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開始</label>
              <select value={managementForm.開始時間} onChange={(e) => setManagementForm({ ...managementForm, 開始時間: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900">
                {timeOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">終了</label>
              <select value={managementForm.終了時間} onChange={(e) => setManagementForm({ ...managementForm, 終了時間: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900">
                {timeOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">参加者</label>
              <input type="text" value={managementForm.参加者} onChange={(e) => setManagementForm({ ...managementForm, 参加者: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900" placeholder="例: 井﨑、武島、〇〇" />
            </div>
          </div>
        );
      case "service_meeting":
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">担当者名</label>
              <input type="text" value={serviceForm.担当者名} onChange={(e) => setServiceForm({ ...serviceForm, 担当者名: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900" placeholder="山田太郎" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">利用者名</label>
              <input type="text" value={serviceForm.利用者名} onChange={(e) => setServiceForm({ ...serviceForm, 利用者名: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900" placeholder="鈴木花子" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開催日</label>
              <input type="date" value={serviceForm.開催日} onChange={(e) => setServiceForm({ ...serviceForm, 開催日: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開催場所</label>
              <select value={serviceForm.開催場所} onChange={(e) => setServiceForm({ ...serviceForm, 開催場所: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900">
                {locationOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開始</label>
              <select value={serviceForm.開始時間} onChange={(e) => setServiceForm({ ...serviceForm, 開始時間: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900">
                {timeOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">終了</label>
              <select value={serviceForm.終了時間} onChange={(e) => setServiceForm({ ...serviceForm, 終了時間: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900">
                {timeOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">開催回数</label>
              <select value={serviceForm.開催回数} onChange={(e) => setServiceForm({ ...serviceForm, 開催回数: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900">
                {meetingCountOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
        );
    }
  };

  // Helper for Theme Colors
  const getThemeColor = (type: DocumentType) => {
    switch (type) {
      case "assessment": return { base: "green", bg: "bg-green-50", text: "text-green-700", border: "border-green-200", btn: "bg-green-600 hover:bg-green-700", btnLight: "bg-green-100 text-green-700" };
      case "service_meeting": return { base: "orange", bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", btn: "bg-orange-500 hover:bg-orange-600", btnLight: "bg-orange-100 text-orange-700" };
      case "management_meeting": return { base: "blue", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", btn: "bg-blue-600 hover:bg-blue-700", btnLight: "bg-blue-100 text-blue-700" };
      default: return { base: "blue", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", btn: "bg-blue-600 hover:bg-blue-700", btnLight: "bg-blue-100 text-blue-700" };
    }
  };

  const theme = getThemeColor(selectedType);

  return (
    <div className={`min-h-screen flex transition-colors duration-500 overflow-x-hidden ${theme.bg}`}>
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
          {/* Assessment ID Removed */}
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
            <div className="flex flex-col items-center justify-center gap-0">
              <img src="/icon.jpg" alt="カカナイ" className="w-8 h-8 rounded-lg" />
              <h1 className="text-[10px] font-bold text-gray-900 leading-none mt-0.5">カカナイ</h1>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar w-full md:w-auto">
              <Link href="/genogram" className="whitespace-nowrap px-2 py-1.5 text-xs md:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition-colors">ジェノグラム</Link>
              <Link href="/body-map" className="whitespace-nowrap px-2 py-1.5 text-xs md:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition-colors">身体図</Link>
              <Link href="/house-plan" className="whitespace-nowrap px-2 py-1.5 text-xs md:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition-colors">家屋図</Link>
              <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 ml-2 flex-shrink-0" title="設定">
                <SettingsIcon />
              </button>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="max-w-5xl mx-auto px-4 py-4">
          {/* Document Type Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 mb-4">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <span className="text-sm font-medium text-gray-700 mr-2 mb-1 md:mb-0">作成:</span>
              <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                {documentTypes.map((type) => {
                  const typeTheme = getThemeColor(type.value);
                  const isActive = selectedType === type.value;
                  return (
                    <button
                      key={type.value}
                      onClick={() => setSelectedType(type.value)}
                      className={`px-3 py-2 md:py-1.5 rounded-lg text-sm font-medium transition-all w-full md:w-auto text-center ${isActive
                        ? `${typeTheme.btn} text-white shadow-md`
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                    >
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Form Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">基本情報</h3>
            {renderFormByType()}
          </div>

          {/* Upload Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">ファイル分析（音声・PDF・画像）- 複数選択可</h3>

            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors mb-3 ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input type="file" multiple accept="audio/*,.m4a,.mp3,.wav,application/pdf,image/*,.jpg,.jpeg,.png" onChange={handleFileChange} className="hidden" id="file-input" />
              <label htmlFor="file-input" className="cursor-pointer flex flex-col items-center">
                <UploadIcon />
                <p className="text-sm text-gray-500 mt-2">{isDragging ? 'ここにドロップして追加' : 'クリックまたはドラッグ&ドロップでファイルを追加'}</p>
                <p className="text-xs text-gray-400">複数選択可能 / 音声(m4a/mp3), PDF, 画像</p>
              </label>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-2 mb-4">
                {files.map((f, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg flex items-center gap-3 border border-gray-100">
                    <div className="flex-shrink-0 text-blue-500">📄</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-700 truncate">{f.name}</p>
                        <p className="text-xs text-gray-500">{(f.size / 1024 / 1024).toFixed(2)}MB</p>
                      </div>
                    </div>
                    {/* Remove Button (only if not processing) */}
                    <button
                      onClick={() => removeFile(i)}
                      disabled={isProcessing}
                      className="text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-400"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => { setFiles([]); setProcessStatus(""); setProcessMessage(""); setResultUrl(null); setExtractionResult(null); }}
                disabled={isProcessing || files.length === 0}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                クリア
              </button>
              <button
                onClick={handleProcess}
                disabled={isProcessing || files.length === 0}
                className={`flex-1 py-3 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex justify-center items-center gap-2 ${theme.btn}`}
              >
                {isProcessing ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                    <span>処理中...</span>
                  </>
                ) : (
                  `選択した${files.length}件を統合して${documentTypes.find(t => t.value === selectedType)?.label}を作成`
                )}
              </button>
            </div>

            {/* Status Message */}
            {processMessage && (
              <div className={`mt-4 p-4 rounded-lg flex flex-col items-center justify-center text-center ${processStatus === "error" ? "bg-red-50 text-red-700 border border-red-200" :
                processStatus === "complete" ? "bg-green-50 text-green-700 border border-green-200" :
                  "bg-blue-50 text-blue-700 border border-blue-200"
                }`}>
                <p className="font-medium">{processMessage}</p>
                {processStatus === "analyzing" && <p className="text-xs mt-1 text-blue-600">※ファイルサイズや数によっては数分かかる場合があります</p>}
                {resultUrl && (
                  <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center px-4 py-2 bg-white text-green-700 border border-green-200 rounded-lg shadow-sm hover:bg-green-50">
                    📊 シートを開く ↗
                  </a>
                )}
              </div>
            )}

            {/* Extraction Result Visualization */}
            {extractionResult && (
              <details className="mt-4 p-4 border rounded bg-gray-50">
                <summary className="cursor-pointer font-bold text-blue-600 select-none">
                  🔍 AI抽出データを確認する
                </summary>
                <div className="mt-2 text-xs overflow-auto max-h-96 bg-white p-2 rounded border border-gray-200">
                  <pre className="whitespace-pre-wrap font-mono text-gray-700">
                    {JSON.stringify(extractionResult, null, 2)}
                  </pre>
                </div>
              </details>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
