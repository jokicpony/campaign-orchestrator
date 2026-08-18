// Firebase exports
export { auth, db } from './config';
export {
    // Campaign CRUD
    getCampaign,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    listAllCampaigns,
    // Locking
    acquireLock,
    releaseLock,
    refreshLock,
    // User
    getUserPreferences,
    saveUserPreferences,
    initializeUserDocument,
    type UserPreferences,
    // Global Settings
    getGlobalSettings,
    updateGlobalSettings,
    initializeGlobalSettings,
} from './firestore';
