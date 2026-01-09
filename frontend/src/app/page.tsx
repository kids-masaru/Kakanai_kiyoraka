"use client";

import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
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
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            介護業務をAIでサポート
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            音声録音やPDFから自動で情報を抽出し、
            Googleスプレッドシートに転記。
            ケアマネジャーの業務効率化を実現します。
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {/* Upload Card */}
          <Link href="/upload" className="group">
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl hover:border-blue-200 transition-all duration-300">
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                <span className="text-3xl">🎤</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                ファイルアップロード
              </h3>
              <p className="text-gray-600 text-sm">
                音声ファイル（M4A, MP3）やPDFをアップロードして
                AIで情報を自動抽出
              </p>
            </div>
          </Link>

          {/* Assessment Card */}
          <Link href="/assessment" className="group">
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl hover:border-green-200 transition-all duration-300">
              <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
                <span className="text-3xl">📝</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                アセスメント作成
              </h3>
              <p className="text-gray-600 text-sm">
                抽出データからアセスメントシートを作成し
                スプレッドシートに自動転記
              </p>
            </div>
          </Link>

          {/* Meeting Card */}
          <Link href="/meeting" className="group">
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 hover:shadow-xl hover:border-purple-200 transition-all duration-300">
              <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-200 transition-colors">
                <span className="text-3xl">📅</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                会議録作成
              </h3>
              <p className="text-gray-600 text-sm">
                サービス担当者会議や運営会議の録音から
                会議録を自動生成
              </p>
            </div>
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
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
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-gray-500 text-sm">
          © 2026 介護DX カカナイ
        </div>
      </footer>
    </div>
  );
}
