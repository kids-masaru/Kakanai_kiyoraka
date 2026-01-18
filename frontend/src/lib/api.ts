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
 * Upload file through backend proxy (bypasses CORS issues)
 */
export async function uploadFileDirect(
    file: File
): Promise<{ success: boolean; file_key: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/upload/direct`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`Failed to upload file: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Analyze audio file
 */
export async function analyzeAudio(
    fileKeyOrKeys: string | string[],
    analysisType: 'assessment' | 'meeting' | 'management_meeting' | 'service_meeting' | 'qa' = 'assessment',
    filenames?: string[]
): Promise<AnalyzeResponse> {
    const body: Record<string, unknown> = {
        analysis_type: analysisType,
    };

    if (Array.isArray(fileKeyOrKeys)) {
        body.file_keys = fileKeyOrKeys;
    } else {
        body.file_key = fileKeyOrKeys;
    }

    if (filenames) {
        body.filenames = filenames;
    }

    const response = await fetch(`${API_BASE_URL}/api/analyze/audio`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    return response.json();
}

/**
 * Analyze audio/files directly (without R2) - supports MULTIPLE files
 * This is the preferred method - matches care-dx-app
 */
export async function analyzeAudioDirect(
    files: File[],
    analysisType: 'assessment' | 'meeting' | 'management_meeting' | 'service_meeting' | 'qa' = 'assessment'
): Promise<AnalyzeResponse> {
    const formData = new FormData();
    files.forEach(file => {
        formData.append('files', file);
    });
    formData.append('analysis_type', analysisType);

    const response = await fetch(`${API_BASE_URL}/api/analyze/audio/direct`, {
        method: 'POST',
        body: formData,
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
 * Analyze image file (JPEG/PNG)
 */
export async function analyzeImage(file: File): Promise<AnalyzeResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/analyze/image`, {
        method: 'POST',
        body: formData,
    });

    return response.json();
}

/**
 * Write data to Google Sheets
 */
/**
 * Write data to Google Sheets
 */
export async function writeToSheets(
    spreadsheetId: string,
    sheetName: string,
    data: Record<string, unknown>,
    mappingType: string = 'assessment',
    // Additional parameters for Meeting modes
    writeMode: 'mapping' | 'append' | 'create' = 'mapping',
    meetingType: string = '',
    meetingDate: string = '',
    meetingTime: string = '',
    meetingPlace: string = '',
    meetingParticipants: string = '',
    // New fields for Service Meeting
    userName: string = '',
    staffName: string = '',
    meetingCount: string = '',
    // New fields for Assessment Sheet
    consultantName: string = '',
    assessmentReason: string = '',
    relationship: string = '',
    assessmentPlace: string = '',
    receptionMethod: string = ''
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
            write_mode: writeMode,
            meeting_type: meetingType,
            date_str: meetingDate,
            time_str: meetingTime,
            place: meetingPlace,
            participants: meetingParticipants,
            // New fields
            user_name: userName,
            staff_name: staffName,
            meeting_count: meetingCount,
            consultant_name: consultantName,
            assessment_reason: assessmentReason,
            relationship: relationship,
            assessment_place: assessmentPlace,
            reception_method: receptionMethod
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
