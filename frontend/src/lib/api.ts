/**
 * API Client for Kakanai Backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface PresignedUrlResponse {
    upload_url: string;
    file_key: string;
}

export interface AnalyzeResponse {
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
}

/**
 * Get presigned URL for R2 direct upload
 */
export async function getPresignedUrl(
    filename: string,
    contentType: string
): Promise<PresignedUrlResponse> {
    const response = await fetch(`${API_BASE_URL}/api/upload/presign`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            filename,
            content_type: contentType,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to get presigned URL: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Upload file directly to R2 using presigned URL
 */
export async function uploadToR2(
    presignedUrl: string,
    file: File
): Promise<void> {
    const response = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: {
            'Content-Type': file.type,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to upload file: ${response.statusText}`);
    }
}

/**
 * Analyze audio file
 */
export async function analyzeAudio(
    fileKey: string,
    analysisType: 'assessment' | 'meeting' | 'qa' = 'assessment'
): Promise<AnalyzeResponse> {
    const response = await fetch(`${API_BASE_URL}/api/analyze/audio`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            file_key: fileKey,
            analysis_type: analysisType,
        }),
    });

    return response.json();
}

/**
 * Analyze PDF file
 */
export async function analyzePdf(file: File): Promise<AnalyzeResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/analyze/pdf`, {
        method: 'POST',
        body: formData,
    });

    return response.json();
}

/**
 * Write data to Google Sheets
 */
export async function writeToSheets(
    spreadsheetId: string,
    sheetName: string,
    data: Record<string, unknown>,
    mappingType: string = 'assessment'
): Promise<AnalyzeResponse> {
    const response = await fetch(`${API_BASE_URL}/api/sheets/write`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            spreadsheet_id: spreadsheetId,
            sheet_name: sheetName,
            data,
            mapping_type: mappingType,
        }),
    });

    return response.json();
}

/**
 * Generate genogram data
 */
export async function generateGenogram(text: string): Promise<AnalyzeResponse> {
    const response = await fetch(`${API_BASE_URL}/api/genogram/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
    });

    return response.json();
}

/**
 * Generate bodymap data
 */
export async function generateBodymap(text: string): Promise<AnalyzeResponse> {
    const response = await fetch(`${API_BASE_URL}/api/bodymap/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
    });

    return response.json();
}
