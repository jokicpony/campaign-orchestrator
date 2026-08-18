/**
 * API Route: Rename a file in Google Drive
 * Used by PublishWizard to rename assets to match structured ad names
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { logger, serializeError } from '@/lib/logger';

export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    try {
        const body = await request.json();
        const { googleAccessToken, fileId, newName } = body;

        if (!googleAccessToken) {
            return NextResponse.json(
                { error: 'Missing Google access token' },
                { status: 401 }
            );
        }

        if (!fileId || !newName) {
            return NextResponse.json(
                { error: 'fileId and newName are required' },
                { status: 400 }
            );
        }

        logger.info('drive', `Renaming file ${fileId}`, { newName });

        // Use Google Drive API to rename the file
        // supportsAllDrives is needed for files in Shared Drives
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
            {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${googleAccessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: newName }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            logger.error('drive', 'Rename failed', { status: response.status, error: errorData });

            // Check for token expiration
            if (response.status === 401) {
                return NextResponse.json(
                    { error: 'Google token expired. Please reconnect your account.', code: 'TOKEN_EXPIRED' },
                    { status: 401 }
                );
            }

            // 403 usually means insufficient permissions or read-only scope
            if (response.status === 403) {
                logger.error('drive', '403 Forbidden - likely missing write scope or file is read-only');
                return NextResponse.json(
                    {
                        error: 'Insufficient permissions to rename file. The file may be read-only or the app needs write access to Google Drive.',
                        code: 'PERMISSION_DENIED',
                        details: errorData.error?.message
                    },
                    { status: 403 }
                );
            }

            return NextResponse.json(
                { error: errorData.error?.message || 'Failed to rename file' },
                { status: response.status }
            );
        }

        const fileData = await response.json();
        logger.info('drive', 'File renamed successfully', { name: fileData.name });

        return NextResponse.json({
            success: true,
            fileId: fileData.id,
            name: fileData.name,
        });

    } catch (error) {
        logger.error('drive', 'Rename error', { error: serializeError(error) });
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
