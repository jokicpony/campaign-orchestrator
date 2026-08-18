import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    query,
    getDocs,
    orderBy,
    serverTimestamp,
    Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { Campaign, CampaignBrief, GlobalPromptSettings, DEFAULT_GLOBAL_SETTINGS, mergeAdTypes } from '@/types';

// ============================================
// Type Converters
// ============================================

// Convert Firestore timestamp to Date
function toDate(timestamp: Timestamp | Date | undefined): Date {
    if (!timestamp) return new Date();
    if (timestamp instanceof Timestamp) {
        return timestamp.toDate();
    }
    return timestamp;
}

// Convert Date to Firestore-safe object and strip undefined values
function toFirestoreData<T>(data: T): T {
    // Firestore doesn't accept undefined - strip it out
    if (data === undefined) return undefined as unknown as T;
    if (data === null) return data;
    if (data instanceof Date) {
        return Timestamp.fromDate(data) as unknown as T;
    }
    if (Array.isArray(data)) {
        return data
            .filter(item => item !== undefined)
            .map(item => toFirestoreData(item)) as unknown as T;
    }
    if (typeof data === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
            // Skip undefined values - Firestore doesn't accept them
            if (value !== undefined) {
                result[key] = toFirestoreData(value);
            }
        }
        return result as T;
    }
    return data;
}

// Convert Firestore data to app types
function fromFirestoreData<T>(data: Record<string, unknown>): T {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        if (value instanceof Timestamp) {
            result[key] = value.toDate();
        } else if (Array.isArray(value)) {
            result[key] = value.map(item =>
                typeof item === 'object' && item !== null
                    ? fromFirestoreData(item as Record<string, unknown>)
                    : item
            );
        } else if (typeof value === 'object' && value !== null) {
            result[key] = fromFirestoreData(value as Record<string, unknown>);
        } else {
            result[key] = value;
        }
    }
    return result as T;
}

// ============================================
// Campaign CRUD
// ============================================

const campaignsCollection = collection(db, 'campaigns');

export async function getCampaign(campaignId: string): Promise<Campaign | null> {
    const docRef = doc(db, 'campaigns', campaignId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        return null;
    }

    const data = docSnap.data();
    return {
        ...fromFirestoreData<Campaign>(data),
        id: docSnap.id,
    };
}

export async function createCampaign(userId: string, name: string): Promise<Campaign> {
    const defaultBrief: CampaignBrief = {
        productId: null,
        targetAudience: '',
        keyMessages: '',
        driveFolderUrl: null,
    };

    const newCampaign: Omit<Campaign, 'id'> = {
        name,
        status: 'draft',
        rows: [],
        palette: {
            historical: [],
            active: [],
        },
        brief: defaultBrief,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    // Add Firestore-specific fields for shared workspace
    const firestoreData = {
        ...toFirestoreData(newCampaign),
        createdBy: userId,  // Who created it (for attribution, not access control)
        lockedBy: null,
        lockedAt: null,
        metaAdAccountId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    const docRef = doc(campaignsCollection);
    await setDoc(docRef, firestoreData);

    return {
        ...newCampaign,
        id: docRef.id,
    };
}

// Strip runtime-only cachedThumbnail from Asset objects before persisting.
// These are base64 data URLs (30-100KB each) that get re-fetched from Google Drive on load.
function stripCachedThumbnails<T>(data: T): T {
    if (data === null || data === undefined) return data;
    if (Array.isArray(data)) {
        return data.map(item => stripCachedThumbnails(item)) as unknown as T;
    }
    if (typeof data === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
            // Skip cachedThumbnail — it's runtime-only cache
            if (key === 'cachedThumbnail') continue;
            result[key] = stripCachedThumbnails(value);
        }
        return result as T;
    }
    return data;
}

export async function updateCampaign(
    campaignId: string,
    updates: Partial<Campaign>
): Promise<void> {
    const docRef = doc(db, 'campaigns', campaignId);

    // Strip runtime-only cachedThumbnail data before persisting
    // These base64 strings can be 30-100KB each and are re-fetched from Drive on load
    const sanitized = stripCachedThumbnails(updates);

    const firestoreUpdates = {
        ...toFirestoreData(sanitized),
        updatedAt: serverTimestamp(),
    };

    await updateDoc(docRef, firestoreUpdates);
}

export async function deleteCampaign(campaignId: string): Promise<void> {
    const docRef = doc(db, 'campaigns', campaignId);
    await deleteDoc(docRef);
}

/**
 * List ALL campaigns in the shared workspace.
 * This is a team tool - all authenticated users see all campaigns.
 * The `createdBy` field tracks who created it, but doesn't restrict access.
 */
export async function listAllCampaigns(): Promise<Campaign[]> {
    const q = query(
        campaignsCollection,
        orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    const campaigns: Campaign[] = [];

    snapshot.forEach((doc) => {
        campaigns.push({
            ...fromFirestoreData<Campaign>(doc.data()),
            id: doc.id,
        });
    });

    // Sort by position (if set), then by createdAt
    return campaigns.sort((a, b) => {
        // If both have positions, sort by position (ascending)
        if (a.position !== undefined && b.position !== undefined) {
            return a.position - b.position;
        }
        // Items with position come first
        if (a.position !== undefined) return -1;
        if (b.position !== undefined) return 1;
        // Otherwise sort by createdAt descending (newest first)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}


// ============================================
// Locking (Soft Lock Pattern)
// ============================================

const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function acquireLock(
    campaignId: string,
    userId: string,
    userName?: string
): Promise<{ success: boolean; lockedBy?: string; lockedByName?: string }> {
    const docRef = doc(db, 'campaigns', campaignId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        return { success: false };
    }

    const data = docSnap.data();
    const lockedBy = data.lockedBy;
    const lockedByName = data.lockedByName;
    const lockedAt = data.lockedAt ? toDate(data.lockedAt) : null;

    // Check if lock exists and is still valid
    if (lockedBy && lockedBy !== userId && lockedAt) {
        const lockAge = Date.now() - lockedAt.getTime();
        if (lockAge < LOCK_TIMEOUT_MS) {
            return { success: false, lockedBy, lockedByName };
        }
        // Lock expired, can acquire
    }

    // Acquire lock
    await updateDoc(docRef, {
        lockedBy: userId,
        lockedByName: userName || null,
        lockedAt: serverTimestamp(),
    });

    return { success: true };
}

export async function releaseLock(campaignId: string): Promise<void> {
    const docRef = doc(db, 'campaigns', campaignId);
    await updateDoc(docRef, {
        lockedBy: null,
        lockedByName: null,
        lockedAt: null,
    });
}

export async function refreshLock(campaignId: string, userId: string): Promise<boolean> {
    const docRef = doc(db, 'campaigns', campaignId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        return false;
    }

    const data = docSnap.data();
    if (data.lockedBy !== userId) {
        return false;
    }

    await updateDoc(docRef, {
        lockedAt: serverTimestamp(),
    });

    return true;
}

// ============================================
// User Preferences
// ============================================

export interface UserPreferences {
    defaultTemperature: number;
    brandVoice?: {
        personaInstructions: string;
        negativeConstraints: string[];
    };
    customModifiers?: Array<{
        id: string;
        label: string;
        emoji: string;
        promptInjection: string;
    }>;
}

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        return null;
    }

    const data = docSnap.data();
    return data.preferences as UserPreferences || null;
}

export async function saveUserPreferences(
    userId: string,
    preferences: Partial<UserPreferences>
): Promise<void> {
    const docRef = doc(db, 'users', userId);

    await setDoc(docRef, {
        preferences,
        updatedAt: serverTimestamp(),
    }, { merge: true });
}

export async function initializeUserDocument(
    userId: string,
    displayName: string,
    email: string,
    photoURL?: string
): Promise<void> {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        await setDoc(docRef, {
            displayName,
            email,
            photoURL: photoURL || null,
            preferences: {
                defaultTemperature: 0.6,
            },
            createdAt: serverTimestamp(),
        });
    }
}

// ============================================
// Global Settings (Shared across all campaigns)
// ============================================

const globalSettingsRef = doc(db, 'settings', 'global');

/**
 * Get global prompt settings. Returns defaults if not yet configured.
 */
export async function getGlobalSettings(): Promise<GlobalPromptSettings> {
    const docSnap = await getDoc(globalSettingsRef);

    if (!docSnap.exists()) {
        return DEFAULT_GLOBAL_SETTINGS;
    }

    const data = docSnap.data();
    const settings = {
        ...DEFAULT_GLOBAL_SETTINGS,
        ...fromFirestoreData<Partial<GlobalPromptSettings>>(data),
    };
    // Saved adTypes may predate newer built-in types (e.g. Carousel) —
    // normalize here so consumers always see the full list
    return {
        ...settings,
        adTypes: mergeAdTypes(settings.adTypes),
    };
}

/**
 * Update global prompt settings (merge with existing).
 */
export async function updateGlobalSettings(
    updates: Partial<GlobalPromptSettings>
): Promise<void> {
    const firestoreData = {
        ...toFirestoreData(updates),
        updatedAt: serverTimestamp(),
    };

    await setDoc(globalSettingsRef, firestoreData, { merge: true });
}

/**
 * Initialize global settings if they don't exist.
 */
export async function initializeGlobalSettings(): Promise<void> {
    const docSnap = await getDoc(globalSettingsRef);

    if (!docSnap.exists()) {
        await setDoc(globalSettingsRef, {
            ...toFirestoreData(DEFAULT_GLOBAL_SETTINGS),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }
}
