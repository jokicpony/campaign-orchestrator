import * as ff from '@google-cloud/functions-framework';
import type { Request, Response } from '@google-cloud/functions-framework';
import { createWriteStream, createReadStream, unlinkSync, statSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID, timingSafeEqual } from 'crypto';

// ── Constants ────────────────────────────────────────────────────────────────

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
// Keep in lockstep with src/lib/meta/constants.ts (v24 expires Oct 6, 2026)
const GRAPH_API_VERSION = 'v25.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;



// ── Types ────────────────────────────────────────────────────────────────────

interface TranscodeRequest {
    googleAccessToken: string;
    metaAccessToken: string;
    adAccountId: string;
    driveFileId: string;
    fileName?: string;
}

interface TranscodeResponse {
    success: boolean;
    videoId?: string;
    status?: string;
    error?: string;
    originalSize?: number;
    transcodedSize?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(phase: string, message: string, data?: Record<string, unknown>) {
    const entry = { phase, message, ...data, timestamp: new Date().toISOString() };
    console.log(JSON.stringify(entry));
}

/**
 * Download a file from Google Drive to a local temp path.
 * Returns the path and the file size in bytes.
 */
async function downloadFromDrive(
    driveFileId: string,
    googleAccessToken: string,
    destPath: string,
): Promise<number> {
    log('download', 'Starting Drive download', { driveFileId });

    const res = await fetch(
        `${DRIVE_API_BASE}/files/${driveFileId}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${googleAccessToken}` } },
    );

    if (!res.ok) {
        throw new Error(`Drive download failed: HTTP ${res.status}`);
    }

    if (!res.body) {
        throw new Error('Drive response has no body');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeReadable = Readable.fromWeb(res.body as any);
    await pipeline(nodeReadable, createWriteStream(destPath));

    const { size } = statSync(destPath);
    log('download', 'Drive download complete', { driveFileId, bytes: size });
    return size;
}

/**
 * Transcode a video using FFmpeg to Meta's recommended spec.
 * Output: H.264, 1080p max, 8 Mbps cap, AAC audio, MP4 container.
 */
function transcode(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        log('transcode', 'Starting FFmpeg transcode', { inputPath, outputPath });

        const args = [
            '-i', inputPath,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-maxrate', '8M',
            '-bufsize', '16M',
            // Scale down to 1920 max width, keep aspect ratio, ensure even height
            '-vf', "scale='min(1920,iw)':-2",
            '-c:a', 'aac',
            '-b:a', '128k',
            // Move moov atom to start for fast streaming
            '-movflags', '+faststart',
            // Overwrite without asking
            '-y',
            outputPath,
        ];

        const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                const { size } = statSync(outputPath);
                log('transcode', 'FFmpeg transcode complete', { outputBytes: size });
                resolve();
            } else {
                log('transcode', 'FFmpeg failed', { code, stderr: stderr.slice(-500) });
                reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-200)}`));
            }
        });

        proc.on('error', (err) => {
            reject(new Error(`FFmpeg spawn error: ${err.message}`));
        });
    });
}



/**
 * Upload a transcoded video file to Meta's advideos endpoint.
 * Uses multipart/form-data with the file as a Blob.
 */
async function uploadToMeta(
    filePath: string,
    metaAccessToken: string,
    adAccountId: string,
    fileName?: string,
): Promise<string> {
    log('upload', 'Starting Meta upload', { adAccountId, fileName });

    const fileBuffer = await readFileAsBuffer(filePath);
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'video/mp4' });

    const formData = new FormData();
    // Output is always MP4 after transcoding
    const uploadName = fileName
        ? fileName.replace(/\.[^.]+$/, '.mp4')
        : 'video.mp4';
    formData.append('source', blob, uploadName);

    const metaUploadRes = await fetch(
        `${GRAPH_API_BASE}/${adAccountId}/advideos?access_token=${metaAccessToken}`,
        { method: 'POST', body: formData },
    );

    const metaData = await metaUploadRes.json() as { id?: string; error?: { message?: string } };

    if (!metaUploadRes.ok || metaData.error || !metaData.id) {
        log('upload', 'Meta upload error', { error: metaData.error });
        throw new Error(metaData.error?.message || 'Failed to upload video to Meta');
    }

    log('upload', 'Meta upload success', { videoId: metaData.id });
    return metaData.id;
}

/**
 * Read a file into a Buffer. For transcoded files this is fine since
 * they're typically 30-60MB after compression.
 */
async function readFileAsBuffer(filePath: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const stream = createReadStream(filePath);
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

/**
 * Clean up temp files, swallowing any errors.
 */
function cleanup(...paths: string[]) {
    for (const p of paths) {
        try {
            unlinkSync(p);
        } catch {
            // Ignore — file may not exist
        }
    }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

// Constant-time compare of the incoming x-api-key against the shared secret.
// Returns false for missing/malformed headers and length mismatches without
// leaking timing about how much of the key matched.
function isValidApiKey(provided: string | string[] | undefined, expected: string): boolean {
    if (typeof provided !== 'string' || provided.length === 0) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

// ── Cloud Function Entry Point ───────────────────────────────────────────────

ff.http('transcodeAndUpload', async (req: Request, res: Response) => {
    // CORS headers for cross-origin requests from the Next.js app
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    // ── API Key Authentication ───────────────────────────────
    // Fail closed: if no key is configured, refuse every request rather than
    // running as an open, publicly-invokable Drive→Meta pipe on caller tokens.
    const expectedKey = process.env.TRANSCODE_API_KEY;
    if (!expectedKey) {
        log('auth', 'TRANSCODE_API_KEY is not set — refusing request');
        res.status(500).json({ error: 'Server misconfigured' });
        return;
    }
    if (!isValidApiKey(req.headers['x-api-key'], expectedKey)) {
        res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
        return;
    }

    const {
        googleAccessToken,
        metaAccessToken,
        adAccountId,
        driveFileId,
        fileName,
    } = req.body as TranscodeRequest;

    // Validate required fields
    if (!googleAccessToken || !metaAccessToken || !adAccountId || !driveFileId) {
        res.status(400).json({
            error: 'Missing required fields: googleAccessToken, metaAccessToken, adAccountId, driveFileId',
        });
        return;
    }

    const jobId = randomUUID().slice(0, 8);
    const inputPath = join(tmpdir(), `${jobId}-input${getExtension(fileName)}`);
    const outputPath = join(tmpdir(), `${jobId}-output.mp4`);

    try {
        log('start', `Job ${jobId}: transcode-and-upload`, { driveFileId, fileName });

        // 1. Download from Drive
        const originalSize = await downloadFromDrive(driveFileId, googleAccessToken, inputPath);

        // 2. Transcode with FFmpeg
        await transcode(inputPath, outputPath);

        const transcodedSize = statSync(outputPath).size;
        const ratio = ((1 - transcodedSize / originalSize) * 100).toFixed(1);
        log('stats', `Compression: ${ratio}% reduction`, {
            originalSize,
            transcodedSize,
            reductionPercent: ratio,
        });

        // 3. Upload to Meta
        const videoId = await uploadToMeta(outputPath, metaAccessToken, adAccountId, fileName);

        const response: TranscodeResponse = {
            success: true,
            videoId,
            status: 'processing',
            originalSize,
            transcodedSize,
        };

        log('complete', `Job ${jobId}: success`, { videoId });
        res.status(200).json(response);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log('error', `Job ${jobId}: failed`, { error: message });

        const response: TranscodeResponse = {
            success: false,
            error: message,
        };

        res.status(500).json(response);

    } finally {
        // Always clean up temp files
        cleanup(inputPath, outputPath);
    }
});

/**
 * Extract file extension from a filename, defaulting to .mp4
 */
function getExtension(fileName?: string): string {
    if (!fileName || !fileName.includes('.')) return '.mp4';
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ext ? `.${ext}` : '.mp4';
}
