// Initialize Supabase client
const SUPABASE_URL = 'https://aobwkcjfhbruihkandlg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvYndrY2pmaGJydWloa2FuZGxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMjE1MjAsImV4cCI6MjA4NzU5NzUyMH0.V7OdMoiiDuXIMOdoUDLlUMjdavSjObHpajb2gHh0E38';

// Use a different name for the client instance to avoid shadowing the global 'supabase' object
const sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabaseClient = sbClient; // Make it globally accessible

// Global helper: Update password in both Auth and Access table
window.updatePasswordWithBio = async (newPwd, userEmail) => {
    try {
        const emailToUse = (userEmail || '').trim();
        console.log('🔄 Syncing new password for:', emailToUse);

        if (!emailToUse) {
            throw new Error("User email is missing. Please try logging out and in again.");
        }

        // 1. Update Supabase Auth password
        const { error: authError } = await window.supabaseClient.auth.updateUser({ password: newPwd });
        if (authError) throw authError;

        // 2. Force Sync to Access Table
        // We use both eq and ilike for robustness, and log the attempt
        const { data: updatedRows, error: dbError } = await window.supabaseClient
            .from('Access')
            .update({
                is_first_login: false,
                password: newPwd
            })
            .eq('email_id', emailToUse)
            .select();

        if (dbError) {
            console.error('❌ Database update error:', dbError);
            throw dbError;
        }

        // Verification step
        if (!updatedRows || updatedRows.length === 0) {
            console.warn('⚠️ Standard update failed. Retrying with case-insensitive search...');

            // Retry with ilike just in case
            const { data: retryRows, error: retryError } = await window.supabaseClient
                .from('Access')
                .update({ is_first_login: false, password: newPwd })
                .ilike('email_id', emailToUse)
                .select();

            if (retryError) throw retryError;

            if (!retryRows || retryRows.length === 0) {
                console.error('❌ Sync completely failed: User record not found for email:', emailToUse);
                throw new Error("Sync failed: User record not found in Access table. This usually happens if your record wasn't created properly or if Row Level Security (RLS) is blocking the update.");
            }
        }

        console.log('✅ Password successfully synced to Auth and Access table.');
        return { success: true };
    } catch (error) {
        console.error('Password Update Error Details:', error);
        return { success: false, message: error.message };
    }
};

// Global helper: Toggle password visibility
window.togglePasswordVisibility = (inputId, btn) => {
    const input = document.getElementById(inputId);
    if (!input) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';

    // Smoothly color the icon
    btn.style.color = isPassword ? 'var(--accent-color)' : 'var(--text-secondary)';
};
