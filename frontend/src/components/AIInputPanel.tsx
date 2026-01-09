import { useState, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import { Person } from '@/lib/types';
import { convertToReactFlow } from '@/lib/genogram-utils';

export interface AIInputPanelProps {
    onGenerate: (data: any, extra?: any) => void;
    onClose: () => void;
    mode?: 'genogram' | 'body_map';
}

export default function AIInputPanel({ onGenerate, onClose, mode = 'genogram' }: AIInputPanelProps) {
    const [text, setText] = useState(mode === 'body_map'
        ? '本人は右片麻痺があり、車椅子を使用。左足に切断の既往あり。仙骨部に褥瘡の恐れがあるため注意が必要。'
        : `本人は田中太郎（65歳、男性）。妻の田中花子（62歳）と同居。
長男の田中一郎（38歳）は結婚して独立、妻と子供2人あり。
長女の田中美咲（35歳）は離婚して実家に戻ってきている。
本人の父は3年前に他界、母（88歳）は施設入所中で認知症あり。`);
    const [files, setFiles] = useState<File[]>([]);
    const [apiKey, setApiKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isConfigured, setIsConfigured] = useState(false);
    const [showApiKeyInput, setShowApiKeyInput] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        fetch('/api/config/check')
            .then(res => res.json())
            .then(data => {
                setIsConfigured(data.configured);
                if (!data.configured) {
                    setShowApiKeyInput(true);
                }
            })
            .catch(() => setShowApiKeyInput(true));
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setFiles(Array.from(e.dataTransfer.files));
        }
    };

    const handleGenerate = async () => {
        if (!text.trim() && files.length === 0) {
            setError('テキスト入力またはファイルのアップロードが必要です');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const formData = new FormData();
            formData.append('text', text);
            formData.append('apiKey', apiKey);
            formData.append('type', mode);
            files.forEach(file => {
                formData.append('files', file);
            });

            const response = await fetch('/api/generate', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'AI生成に失敗しました');
            }

            if (mode === 'genogram') {
                const { nodes, edges } = convertToReactFlow(data);
                onGenerate(nodes, edges);
            } else {
                onGenerate(data);
            }
            onClose();
        } catch (err: any) {
            setError(err.message || 'エラーが発生しました');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
        }}>
            <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '24px',
                width: '90%',
                maxWidth: '600px',
                maxHeight: '90vh',
                overflow: 'auto',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>
                        {mode === 'body_map' ? '🤖 AIで身体図生成' : '🤖 AIでジェノグラム生成'}
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>×</button>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                        Gemini APIキー
                    </label>

                    {isConfigured && !showApiKeyInput ? (
                        <div style={{
                            padding: '10px',
                            background: '#ecfdf5',
                            border: '1px solid #10b981',
                            borderRadius: '6px',
                            color: '#059669',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span>✅ 環境変数で設定済み</span>
                            <button
                                onClick={() => setShowApiKeyInput(true)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#059669',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }}
                            >
                                別のキーを使用
                            </button>
                        </div>
                    ) : (
                        <div>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="AIzaSy..."
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '6px',
                                    border: '1px solid #ccc',
                                    fontSize: '14px',
                                }}
                            />
                            <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0' }}>
                                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
                                    Google AI Studioでキーを取得 →
                                </a>
                                {isConfigured && (
                                    <button
                                        onClick={() => setShowApiKeyInput(false)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#666',
                                            textDecoration: 'underline',
                                            cursor: 'pointer',
                                            marginLeft: '10px'
                                        }}
                                    >
                                        設定済みのキーを使用
                                    </button>
                                )}
                            </p>
                        </div>
                    )}
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                        {mode === 'body_map' ? '身体状況の説明 / アセスメントシート' : '家族構成の説明 / 資料'}
                    </label>
                    <p style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                        テキストでの説明に加え、音声データ、画像（アセスメントシート等）、PDFをアップロードできます。複合的に分析します。
                    </p>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={6}
                        placeholder={mode === 'body_map' ? "例：右片麻痺、仙骨部に発赤..." : "テキストでの説明はこちら（例：本人は田中太郎...）"}
                        style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '6px',
                            border: '1px solid #ccc',
                            fontSize: '14px',
                            resize: 'vertical',
                            marginBottom: '8px'
                        }}
                    />

                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        style={{
                            border: `2px dashed ${isDragging ? '#3b82f6' : '#ccc'}`,
                            padding: '16px',
                            borderRadius: '6px',
                            textAlign: 'center',
                            background: isDragging ? '#eff6ff' : '#f9fafb',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <label style={{ cursor: 'pointer', display: 'block' }}>
                            <div style={{ marginBottom: '4px', fontSize: '24px' }}>
                                {isDragging ? '📂' : '📁'}
                            </div>
                            <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                                {isDragging ? 'ここにドロップ' : 'ファイルを選択 または ドロップ'}
                            </span>
                            <span style={{ fontSize: '12px', color: '#666', display: 'block', marginTop: '4px' }}>
                                画像 / 音声 / PDF (複数可)
                            </span>
                            <input
                                type="file"
                                multiple
                                accept="image/*,audio/*,application/pdf"
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />
                        </label>
                    </div>

                    {files.length > 0 && (
                        <div style={{ marginTop: '8px', fontSize: '12px' }}>
                            <strong>選択されたファイル:</strong>
                            <ul style={{ paddingLeft: '20px', margin: '4px 0 0', color: '#555' }}>
                                {files.map((f, i) => (
                                    <li key={i}>{f.name} ({(f.size / 1024).toFixed(1)} KB)</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {error && (
                    <div style={{ color: '#dc2626', background: '#fee2e2', padding: '10px', borderRadius: '6px', marginBottom: '16px' }}>
                        {error}
                    </div>
                )}

                <button
                    onClick={handleGenerate}
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: '12px',
                        background: loading ? '#ccc' : '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                >
                    {loading ? '生成中...' : (mode === 'body_map' ? '✨ 身体図を生成' : '✨ ジェノグラムを生成')}
                </button>
            </div>
        </div>
    );
}
