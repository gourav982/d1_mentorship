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

// --- GLOBAL PERMISSION ENGINE ---
window.hasPermission = async (permissionKey) => {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return false;

        // 1. Fetch User's Role
        const { data: userData } = await window.supabaseClient
            .from('Access')
            .select('role')
            .ilike('email_id', session.user.email)
            .single();

        if (!userData) return false;
        if (userData.role === 'Super admin') return true; // Super admin always has all perms

        // 2. Check Permission Matrix with case resilience
        let res = await window.supabaseClient
            .from('Role_Permissions')
            .select('is_granted')
            .eq('role_name', userData.role)
            .eq('permission_key', permissionKey)
            .single();

        if (res.error && (res.error.message?.includes('not find') || res.error.message?.includes('cache') || res.error.code === '42P01')) {
            res = await window.supabaseClient
                .from('role_permissions')
                .select('is_granted')
                .eq('role_name', userData.role)
                .eq('permission_key', permissionKey)
                .single();
        }

        const perm = res.data;
        return perm ? perm.is_granted : false;
    } catch (err) {
        console.error('Permission Check Error:', err);
        return false;
    }
};

// Auto-apply permissions to all elements with [data-permission]
// 2. Global Profile Sync (Fixes "Loading..." issue)
window.syncUserProfile = async () => {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;

        let { data: userData } = await window.supabaseClient
            .from('Access')
            .select('role, name, email_id, enrolment_id, centre_name')
            .ilike('email_id', session.user.email)
            .single();

        if (!userData) {
            const retry = await window.supabaseClient.from('access').select('role, name, email_id, enrolment_id, centre_name').ilike('email_id', session.user.email).single();
            userData = retry.data;
        }

        if (userData) {
            const nameDisplay = document.getElementById('display-name');
            const roleDisplay = document.getElementById('display-role');
            const avatarCircle = document.getElementById('avatar-circle');

            if (nameDisplay) nameDisplay.textContent = userData.name || session.user.email.split('@')[0];
            if (roleDisplay) roleDisplay.textContent = userData.role || 'Member';
            if (avatarCircle) avatarCircle.textContent = (userData.name || 'U').charAt(0).toUpperCase();

            // Populate profile modal fields if they exist
            const pName = document.getElementById('profile-name');
            const pEmail = document.getElementById('profile-email');
            const pEnrol = document.getElementById('profile-enrolment');
            if (pName) pName.value = userData.name || '';
            if (pEmail) pEmail.value = userData.email_id || '';
            if (pEnrol) pEnrol.value = `${userData.enrolment_id || 'N/A'} • ${userData.centre_name || 'N/A'}`;
        }
        return userData;
    } catch (err) {
        console.error('Profile Sync Error:', err);
    }
};

window.redirectToDefaultPage = async (userData) => {
    if (!userData) return;

    const role = userData.role;
    const currentPath = window.location.pathname;

    let targetPage = 'dashboard.html'; // Default for students

    if (role === 'Mentor') {
        targetPage = 'mentor-queries.html';
    } else if (role === 'Admin' || role === 'Super admin') {
        targetPage = 'admin-users.html';
    } else if (role === 'Academics') {
        targetPage = 'upload-schedule.html';
    }

    // Only redirect if we are on index.html or if we are on dashboard.html but shouldn't be
    if (currentPath.includes('index.html') || currentPath === '/' || (currentPath.includes('dashboard.html') && role !== 'Students')) {
        console.log(`🚀 Routing ${role} to ${targetPage}`);
        window.location.replace(targetPage);
    }
};

window.applyPermissions = async () => {
    const elements = document.querySelectorAll('[data-permission]');

    try {
        // Sync profile first
        const userData = await window.syncUserProfile();
        if (!userData) return;

        // Auto-redirect if on wrong page for role
        await window.redirectToDefaultPage(userData);

        const isSuperAdmin = userData.role === 'Super admin';

        // 3. Fetch permissions (Skip if super admin to allow all)
        let permMap = {};
        if (!isSuperAdmin) {
            let res = await window.supabaseClient.from('Role_Permissions').select('permission_key, is_granted').eq('role_name', userData.role);
            if (res.error) res = await window.supabaseClient.from('role_permissions').select('permission_key, is_granted').eq('role_name', userData.role);
            const perms = res.data;
            permMap = perms ? Object.fromEntries(perms.map(p => [p.permission_key, p.is_granted])) : {};
        }

        // 4. Apply Individual Item Visibility
        elements.forEach(el => {
            const key = el.getAttribute('data-permission');
            // Hide if denied OR if missing AND NOT super admin
            if (!isSuperAdmin && (permMap[key] === false || permMap[key] === undefined)) {
                el.style.display = 'none';
                el.classList.add('perm-hidden');
            } else {
                el.style.display = ''; // Restore default
                el.classList.remove('perm-hidden');
            }
        });

        // 5. Special Unhide for Super Admin (Admin sections & tabs)
        if (isSuperAdmin) {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
            const mTabs = document.getElementById('mentor-tabs');
            if (mTabs) mTabs.style.display = 'flex';
        }

        // 6. COUPLED SECTION LOGIC: Hide Nav Group if NO permitted functional items are visible inside it.
        document.querySelectorAll('.nav-group').forEach(group => {
            let next = group.nextElementSibling;
            let sectionHasFunctionalAccess = false;
            let sectionItems = [];

            // Traverse siblings until next group or admin corner
            while (next && !next.classList.contains('nav-group') && !next.classList.contains('admin-only')) {
                if (next.classList.contains('nav-item')) {
                    sectionItems.push(next);
                    const key = next.getAttribute('data-permission');
                    // A section is "Open" only if an item with a PERMISSION KEY is granted and visible
                    if (key && next.style.display !== 'none') {
                        sectionHasFunctionalAccess = true;
                    }
                }
                next = next.nextElementSibling;
            }

            if (!sectionHasFunctionalAccess && !isSuperAdmin) {
                group.style.display = 'none';
                sectionItems.forEach(item => item.style.display = 'none');
            } else {
                group.style.display = 'block';
                // Items themselves maintain their display state from step 4
            }
        });

        // 6. Handle Admin Corner separately
        const adminSec = document.getElementById('admin-section');
        if (adminSec) {
            const visibleItems = adminSec.querySelectorAll('.nav-item:not([style*="display: none"])');
            adminSec.style.display = (visibleItems.length > 0 || isSuperAdmin) ? 'block' : 'none';
        }

    } catch (err) {
        console.error('Apply Permissions Error:', err);
    }
};

// --------------------------------------------------------------------------
// CENTRE ACCESS HELPER
// --------------------------------------------------------------------------
window.getAllowedCentres = async () => {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return [];

        let { data: userData, error: fetchErr } = await window.supabaseClient
            .from('Access')
            .select('role, centre_name')
            .ilike('email_id', session.user.email)
            .single();

        if (fetchErr || !userData) {
            const retry = await window.supabaseClient.from('access').select('role, centre_name').ilike('email_id', session.user.email).single();
            userData = retry.data;
        }

        if (!userData) return [];

        // Special Case: Super admin sees everything
        if (userData.role === 'Super admin') {
            const { data: all } = await window.supabaseClient.from('Centres').select('name');
            return all ? all.map(c => c.name) : [];
        }

        // Special Case: Students ONLY see their own centre
        if (userData.role === 'Students') {
            return userData.centre_name ? [userData.centre_name] : [];
        }

        // Standard Case: Check Role_Centres mapping
        let res = await window.supabaseClient.from('Role_Centres').select('centre_name').eq('role_name', userData.role);

        // Lowercase fallback resilience
        if (res.error && (res.error.message?.includes('not find') || res.error.message?.includes('cache') || res.error.code === '42P01' || res.error.code === 'PGRST116')) {
            res = await window.supabaseClient.from('role_centres').select('centre_name').eq('role_name', userData.role);
        }

        const allowed = res.data ? res.data.map(rc => rc.centre_name) : [];

        // Critical Security logic: If mapping exists, it MUST be followed.
        // Fallback to profile centre ONLY if no Role_Centres mapping is defined at all.
        if (allowed.length === 0 && userData.centre_name) {
            console.warn(`No Role_Centres mapping for ${userData.role}. Falling back to profile centre: ${userData.centre_name}`);
            return [userData.centre_name];
        }

        return allowed;
    } catch (err) {
        console.error('Centre Access Error:', err);
        return [];
    }
};
