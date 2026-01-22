"use client";

import { useState, useCallback, useRef } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import {
    FilePdf,
    Files,
    ArrowsMerge,
    Scissors,
    UploadSimple,
    Trash,
    DownloadSimple,
    CheckCircle,
    FileArchive,
    Gear
} from "@phosphor-icons/react";
import Header from "@/components/Header";

interface MergeFile {
    file: File;
    id: string;
}

interface SplitFile {
    file: File;
    pageCount: number;
    doc: PDFDocument | null;
}

export default function PdfToolPage() {
    const [activeTab, setActiveTab] = useState<"merge" | "split">("merge");

    // Merge State
    const [mergeFiles, setMergeFiles] = useState<MergeFile[]>([]);
    const mergeInputRef = useRef<HTMLInputElement>(null);

    // Split State
    const [splitFile, setSplitFile] = useState<SplitFile | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [pageRange, setPageRange] = useState("");
    const [previewText, setPreviewText] = useState("");
    const [outputMode, setOutputMode] = useState<"split" | "merge">("split");
    const splitInputRef = useRef<HTMLInputElement>(null);

    // UI State
    const [isProcessing, setIsProcessing] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // --- Toast ---
    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    // --- Merge Handlers ---
    const handleMergeFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            addMergeFiles(Array.from(e.target.files));
        }
    };

    const addMergeFiles = (files: File[]) => {
        const newFiles = files
            .filter(f => f.type === 'application/pdf')
            .map(f => ({ file: f, id: Math.random().toString(36).substr(2, 9) }));
        setMergeFiles(prev => [...prev, ...newFiles]);
    };

    const removeMergeFile = (index: number) => {
        setMergeFiles(prev => prev.filter((_, i) => i !== index));
    };

    const executeMerge = async () => {
        if (mergeFiles.length === 0) return;
        setIsProcessing(true);
        showToast('結合中...');

        try {
            const mergedPdf = await PDFDocument.create();
            for (const item of mergeFiles) {
                const arrayBuffer = await item.file.arrayBuffer();
                const pdf = await PDFDocument.load(arrayBuffer);
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }
            const pdfBytes = await mergedPdf.save();
            downloadFile(pdfBytes, 'merged_document.pdf', 'application/pdf');
            showToast('完了しました');
        } catch (err) {
            console.error(err);
            showToast('エラーが発生しました');
        } finally {
            setIsProcessing(false);
        }
    };

    // --- Split Handlers ---
    const handleSplitFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            loadSplitFile(e.target.files[0]);
        }
    };

    const loadSplitFile = async (file: File) => {
        if (file.type !== 'application/pdf') {
            showToast('PDFを選択してください');
            return;
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            const doc = await PDFDocument.load(arrayBuffer);
            const pageCount = doc.getPageCount();

            setSplitFile({ file, doc, pageCount });
            setPageRange(`1-${pageCount}`);
            updatePreview(`1-${pageCount}`, pageCount);
        } catch (err) {
            console.error(err);
            showToast('読み込み失敗');
        }
    };

    const resetSplitFile = () => {
        setSplitFile(null);
        setPageRange("");
        setPreviewText("");
        setShowAdvanced(false);
        if (splitInputRef.current) splitInputRef.current.value = "";
    };

    const executeSplitAll = async () => {
        if (!splitFile) return;
        // Split all pages individually
        const targetPages = Array.from({ length: splitFile.pageCount }, (_, i) => i + 1);
        executeExtraction(targetPages, 'split');
    };

    const executeCustomSplit = () => {
        if (!splitFile) return;
        const targetPages = parsePageInput(pageRange, splitFile.pageCount);
        if (targetPages.length === 0) {
            showToast('ページを指定してください');
            return;
        }
        executeExtraction(targetPages, outputMode);
    };

    const executeExtraction = async (targetPages: number[], mode: "split" | "merge") => {
        if (!splitFile || !splitFile.doc) return;
        setIsProcessing(true);
        showToast('処理中...');

        try {
            const indices = targetPages.map(p => p - 1);
            const baseName = splitFile.file.name.replace('.pdf', '');

            if (mode === 'merge') {
                const newPdf = await PDFDocument.create();
                const copiedPages = await newPdf.copyPages(splitFile.doc, indices);
                copiedPages.forEach(page => newPdf.addPage(page));
                const pdfBytes = await newPdf.save();
                downloadFile(pdfBytes, `${baseName}_custom.pdf`, 'application/pdf');
            } else {
                const zip = new JSZip();
                for (let i = 0; i < indices.length; i++) {
                    const originalPageIndex = indices[i];
                    const displayPageNum = targetPages[i];

                    const singleDoc = await PDFDocument.create();
                    const [copiedPage] = await singleDoc.copyPages(splitFile.doc, [originalPageIndex]);
                    singleDoc.addPage(copiedPage);
                    const pdfBytes = await singleDoc.save();

                    zip.file(`${baseName}_P${String(displayPageNum).padStart(3, '0')}.pdf`, pdfBytes);
                }
                const blob = await zip.generateAsync({ type: "blob" });
                downloadFile(blob, `${baseName}_split.zip`, 'application/zip');
            }
            showToast('ダウンロード完了');
        } catch (err) {
            console.error(err);
            showToast('エラー: ' + (err as Error).message);
        } finally {
            setIsProcessing(false);
        }
    };

    // --- Helpers ---
    const downloadFile = (data: Uint8Array | Blob, filename: string, mimeType: string) => {
        const blob = data instanceof Blob ? data : new Blob([data as any], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const parsePageInput = (input: string, maxPages: number): number[] => {
        if (!input.trim()) return [];
        const normalized = input
            .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
            .replace(/,/g, ',')
            .replace(/、/g, ',')
            .replace(/\s+/g, '');

        const parts = normalized.split(',');
        const pages = new Set<number>();

        parts.forEach(part => {
            if (part.includes('-')) {
                const [s, e] = part.split('-').map(Number);
                if (!isNaN(s) && !isNaN(e)) {
                    const start = Math.min(s, e);
                    const end = Math.max(s, e);
                    for (let i = start; i <= end; i++) {
                        if (i >= 1 && i <= maxPages) pages.add(i);
                    }
                }
            } else {
                const n = parseInt(part);
                if (!isNaN(n) && n >= 1 && n <= maxPages) pages.add(n);
            }
        });
        return Array.from(pages).sort((a, b) => a - b);
    };

    const updatePreview = (input: string, maxPages: number) => {
        const pages = parsePageInput(input, maxPages);
        if (pages.length === 0) setPreviewText("対象なし");
        else if (pages.length > 10) setPreviewText(`P.${pages[0]}...P.${pages[pages.length - 1]} (計${pages.length}枚)`);
        else setPreviewText(pages.map(p => `P.${p}`).join(", "));
    };

    // --- Drag & Drop ---
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const handleDropMerge = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (e.dataTransfer.files) addMergeFiles(Array.from(e.dataTransfer.files));
    };
    const handleDropSplit = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) loadSplitFile(e.dataTransfer.files[0]);
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
            <Header />

            {/* Main Content */}
            <main className="flex-grow p-4 md:p-8">
                <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden min-h-[500px]">

                    {/* Tabs */}
                    <div className="flex border-b border-slate-200">
                        <button
                            onClick={() => setActiveTab("merge")}
                            className={`flex-1 py-4 text-center font-bold transition-colors flex items-center justify-center gap-2
                ${activeTab === "merge" ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50/30" : "text-slate-500 hover:bg-slate-50"}`}
                        >
                            <ArrowsMerge className="w-5 h-5" />
                            PDF結合
                        </button>
                        <button
                            onClick={() => setActiveTab("split")}
                            className={`flex-1 py-4 text-center font-bold transition-colors flex items-center justify-center gap-2
                ${activeTab === "split" ? "text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/30" : "text-slate-500 hover:bg-slate-50"}`}
                        >
                            <Scissors className="w-5 h-5" />
                            PDF分割
                        </button>
                    </div>

                    <div className="p-6 md:p-8">

                        {/* --- MERGE MODE --- */}
                        {activeTab === "merge" && (
                            <div className="animate-fade-in">
                                <div className="text-center mb-6">
                                    <h2 className="text-lg font-bold mb-2">複数のPDFをひとつにまとめる</h2>
                                    <p className="text-slate-500 text-sm">ファイルをドラッグ＆ドロップして追加できます</p>
                                </div>

                                <div
                                    onClick={() => mergeInputRef.current?.click()}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDropMerge}
                                    className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center transition-colors cursor-pointer hover:border-blue-400 hover:bg-blue-50 group"
                                >
                                    <input ref={mergeInputRef} type="file" className="hidden" accept=".pdf" multiple onChange={handleMergeFiles} />
                                    <UploadSimple className="w-12 h-12 text-slate-400 mb-2 mx-auto group-hover:text-blue-500 transition-colors" />
                                    <p className="font-medium text-slate-600 group-hover:text-blue-600">ここにPDFファイルをドロップ</p>
                                </div>

                                <ul className="mt-6 space-y-2">
                                    {mergeFiles.map((item, index) => (
                                        <li key={item.id} className="bg-white border border-slate-200 rounded p-3 flex items-center justify-between shadow-sm">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <span className="bg-blue-100 text-blue-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                                                    {index + 1}
                                                </span>
                                                <span className="truncate font-medium">{item.file.name}</span>
                                            </div>
                                            <button onClick={() => removeMergeFile(index)} className="p-1 text-slate-400 hover:text-red-500">
                                                <Trash className="w-5 h-5" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>

                                {mergeFiles.length > 0 && (
                                    <div className="mt-8 text-center">
                                        <button
                                            onClick={executeMerge}
                                            disabled={isProcessing}
                                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-full shadow-md transition-all transform hover:scale-105 flex items-center justify-center mx-auto gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isProcessing ? <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span> : <DownloadSimple className="w-6 h-6" />}
                                            結合してダウンロード
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* --- SPLIT MODE --- */}
                        {activeTab === "split" && (
                            <div className="animate-fade-in">
                                <div className="text-center mb-6">
                                    <h2 className="text-lg font-bold mb-2">PDFをページごとにバラバラにする</h2>
                                    <p className="text-slate-500 text-sm">ファイルを入れるだけで、すべてのページを個別に分割します</p>
                                </div>

                                <div
                                    onClick={() => !splitFile && splitInputRef.current?.click()}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDropSplit}
                                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors mb-6 
                    ${splitFile
                                            ? "border-emerald-400 bg-emerald-50 cursor-default"
                                            : "border-slate-300 hover:border-emerald-400 hover:bg-emerald-50 cursor-pointer group"}`}
                                >
                                    <input ref={splitInputRef} type="file" className="hidden" accept=".pdf" onChange={handleSplitFileChange} />

                                    {!splitFile ? (
                                        <>
                                            <FilePdf className="w-12 h-12 text-slate-400 mb-2 mx-auto group-hover:text-emerald-500 transition-colors" />
                                            <p className="font-medium text-slate-600 group-hover:text-emerald-600">ここにPDFファイルを1つドロップ</p>
                                        </>
                                    ) : (
                                        <div className="animate-fade-in">
                                            <div className="flex items-center justify-center gap-3 text-emerald-700 font-bold text-lg">
                                                <CheckCircle className="w-8 h-8" weight="fill" />
                                                <span className="truncate max-w-xs">{splitFile.file.name}</span>
                                            </div>
                                            <p className="text-sm text-emerald-600 mt-1">全 {splitFile.pageCount} ページ</p>
                                            <button onClick={resetSplitFile} className="mt-3 text-xs text-slate-400 hover:text-red-500 underline">
                                                ファイルを変更
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {splitFile && (
                                    <div className="text-center animate-fade-in-up">
                                        <button
                                            onClick={executeSplitAll}
                                            disabled={isProcessing}
                                            className="w-full md:w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-5 px-8 rounded-xl shadow-lg transition-all transform hover:scale-[1.02] flex items-center justify-center mx-auto gap-3 text-lg disabled:opacity-50"
                                        >
                                            {isProcessing ? (
                                                <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></span>
                                            ) : (
                                                <FileArchive className="w-8 h-8" />
                                            )}
                                            <div className="text-left">
                                                <span className="block leading-none">全ページをバラバラにして保存</span>
                                                <span className="text-xs font-normal opacity-80 mt-1 block">ZIPファイルでダウンロードされます</span>
                                            </div>
                                        </button>

                                        <div className="mt-8 pt-4 border-t border-slate-100">
                                            <button
                                                onClick={() => setShowAdvanced(!showAdvanced)}
                                                className="text-sm text-slate-500 hover:text-blue-600 flex items-center justify-center gap-1 mx-auto transition-colors"
                                            >
                                                <Gear className="w-4 h-4" />
                                                特定のページだけ抽出・結合したい場合はこちら
                                            </button>
                                        </div>

                                        {showAdvanced && (
                                            <div className="mt-4 bg-slate-50 rounded-lg p-6 border border-slate-200 text-left animate-fade-in">
                                                <h3 className="text-sm font-bold text-slate-700 mb-4 border-b border-slate-200 pb-2">詳細設定</h3>

                                                <div className="mb-4">
                                                    <label className="block text-xs font-bold text-slate-500 mb-1">ページ指定 (例: 1, 3-5)</label>
                                                    <input
                                                        type="text"
                                                        value={pageRange}
                                                        onChange={(e) => {
                                                            setPageRange(e.target.value);
                                                            updatePreview(e.target.value, splitFile.pageCount);
                                                        }}
                                                        className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                                                        placeholder="例: 1-3, 5"
                                                    />
                                                    <div className="mt-2 flex flex-wrap gap-1 text-xs text-slate-600 min-h-[1.5rem]">
                                                        {previewText ? (
                                                            <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">{previewText}</span>
                                                        ) : (
                                                            <span className="text-slate-400">対象なし</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="mb-6">
                                                    <label className="block text-xs font-bold text-slate-500 mb-2">保存形式</label>
                                                    <div className="flex gap-4">
                                                        <label className="flex items-center cursor-pointer">
                                                            <input
                                                                type="radio"
                                                                checked={outputMode === "split"}
                                                                onChange={() => setOutputMode("split")}
                                                                className="text-emerald-600 focus:ring-emerald-500"
                                                            />
                                                            <span className="ml-2 text-sm">バラバラ (ZIP)</span>
                                                        </label>
                                                        <label className="flex items-center cursor-pointer">
                                                            <input
                                                                type="radio"
                                                                checked={outputMode === "merge"}
                                                                onChange={() => setOutputMode("merge")}
                                                                className="text-emerald-600 focus:ring-emerald-500"
                                                            />
                                                            <span className="ml-2 text-sm">結合 (PDF)</span>
                                                        </label>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={executeCustomSplit}
                                                    disabled={isProcessing}
                                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow transition-colors text-sm disabled:opacity-50"
                                                >
                                                    指定内容でダウンロード
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>
            </main>

            {/* Toast */}
            <div
                className={`fixed bottom-4 right-4 bg-slate-800 text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 z-50
          ${toastMessage ? "translate-y-0 opacity-100" : "translate-y-20 opacity-0"}`}
            >
                {toastMessage}
            </div>

            <style jsx global>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fade-in-up 0.3s ease-out; }
      `}</style>
        </div>
    );
}
