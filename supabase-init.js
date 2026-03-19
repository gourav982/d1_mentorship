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
window.getCachedAuth = (email) => {
    try {
        const cache = JSON.parse(sessionStorage.getItem('dbmci_auth_cache_v2'));
        if (cache && cache.email === email && (Date.now() - cache.timestamp < 3600000)) return cache;
    } catch(e) {}
    return null;
};

window.setCachedAuth = (email, userData, permMap) => {
    sessionStorage.setItem('dbmci_auth_cache_v2', JSON.stringify({ email, userData, permMap, timestamp: Date.now() }));
};

// 2. Global Profile Sync
window.syncUserProfile = async (forceRefetch = false) => {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;
        const email = session.user.email;

        let cache = window.getCachedAuth(email);
        let userData = cache && !forceRefetch ? cache.userData : null;

        if (!userData) {
            let { data: res } = await window.supabaseClient
                .from('Access')
                .select('*') // Grabs EVERYTHING so pages don't need to rebuild it
                .eq('email_id', email) // Substantially faster index scan
                .single();

            if (!res) {
                const retry = await window.supabaseClient.from('access').select('*').ilike('email_id', email).single();
                res = retry.data;
            }
            userData = res;
            if (userData) {
                window.setCachedAuth(email, userData, cache ? cache.permMap : null);
            }
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
            const pExtra = document.getElementById('profile-extra');
            const pExtraGroup = document.getElementById('profile-extra-group');
            const pExtraLabel = document.getElementById('profile-extra-label');

            if (pName) pName.value = userData.name || '';
            if (pEmail) pEmail.value = userData.email_id || '';

            if (pExtra && userData.role === 'Students') {
                pExtra.value = `${userData.enrolment_id || 'N/A'} • ${userData.centre_name || 'N/A'}`;
                if (pExtraGroup) pExtraGroup.style.display = 'block';
                if (pExtraLabel) pExtraLabel.textContent = 'Enrolment & Centre';
            } else if (pExtraGroup) {
                pExtraGroup.style.display = 'none';
            }
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

window.applyPermissions = async (forceRefetch = false) => {
    const elements = document.querySelectorAll('[data-permission]');

    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;
        const email = session.user.email;

        // Sync profile instantly via cache
        const userData = await window.syncUserProfile(forceRefetch);
        if (!userData) return;

        // Auto-redirect if on wrong page for role
        await window.redirectToDefaultPage(userData);

        const isSuperAdmin = userData.role === 'Super admin';
        let cache = window.getCachedAuth(email) || { email, userData };
        let permMap = cache.permMap;

        // 3. Fetch permissions (Skip if super admin to allow all, skip if cached)
        if (!isSuperAdmin && (!permMap || forceRefetch)) {
            let res = await window.supabaseClient.from('Role_Permissions').select('permission_key, is_granted').eq('role_name', userData.role);
            if (res.error) res = await window.supabaseClient.from('role_permissions').select('permission_key, is_granted').eq('role_name', userData.role);
            const perms = res.data;
            permMap = perms ? Object.fromEntries(perms.map(p => [p.permission_key, p.is_granted])) : {};
            cache.permMap = permMap;
            window.setCachedAuth(email, cache.userData, permMap);
        }

        // 4. Apply Individual Item Visibility
        elements.forEach(el => {
            const key = el.getAttribute('data-permission');
            // Hide if denied OR if missing AND NOT super admin
            if (!isSuperAdmin && (permMap[key] === false || permMap[key] === undefined)) {
                el.style.display = 'none';
                el.classList.add('perm-hidden');
                el.classList.remove('perm-verified');
            } else {
                el.style.display = ''; // Restore default flex/block layout
                el.classList.remove('perm-hidden');
                el.classList.add('perm-verified'); // Disables native CSS stealth lock
            }
        });

        // 5. Special Unhide for Super Admin (Admin sections & tabs)
        if (isSuperAdmin) {
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = 'block';
                el.classList.add('perm-verified');
            });
            const mTabs = document.getElementById('mentor-tabs');
            if (mTabs) mTabs.style.display = 'flex';
        }

        // 6. COUPLED SECTION LOGIC: Hide Nav Group if NO permitted functional items are visible inside it.
        document.querySelectorAll('.nav-section').forEach(section => {
            const group = section.querySelector('.nav-group');
            const container = section.querySelector('.nav-items-container');
            if (!group || !container) return;

            let sectionHasFunctionalAccess = false;
            const items = container.querySelectorAll('.nav-item');

            items.forEach(item => {
                const key = item.getAttribute('data-permission');
                // Check if it legally exists under the verification class instead of just style
                if (item.classList.contains('perm-verified') || item.style.display !== 'none') {
                    if (key) sectionHasFunctionalAccess = true;
                }
            });

            if (!sectionHasFunctionalAccess && !isSuperAdmin) {
                section.style.display = 'none';
                section.classList.remove('perm-verified');
            } else {
                section.style.display = 'block';
                section.classList.add('perm-verified');
            }
        });

        // 6. Handle Admin Corner separately
        const adminSec = document.getElementById('admin-section');
        if (adminSec) {
            const visibleItems = adminSec.querySelectorAll('.nav-item.perm-verified, .nav-item:not([style*="display: none"])');
            if (visibleItems.length > 0 || isSuperAdmin) {
                adminSec.style.display = 'block';
                adminSec.classList.add('perm-verified');
            } else {
                adminSec.style.display = 'none';
                adminSec.classList.remove('perm-verified');
            }
        }

        // 7. Auto-expand the active section
        const activeLink = document.querySelector('.nav-item.active');
        if (activeLink) {
            const container = activeLink.closest('.nav-items-container');
            if (container && container.style.display !== 'none') {
                container.classList.add('expanded');
                const section = container.closest('.nav-section');
                if (section) section.classList.add('expanded');
            }
        }

    } catch (err) {
        console.error('Apply Permissions Error:', err);
    }
};

window.toggleNavGroup = (element) => {
    const container = element.nextElementSibling;
    if (container && container.classList.contains('nav-items-container')) {
        container.classList.toggle('expanded');
    }
    const section = element.closest('.nav-section');
    if (section) {
        section.classList.toggle('expanded');
    }
};

// --------------------------------------------------------------------------
// CENTRE ACCESS HELPER
// --------------------------------------------------------------------------
window.getAllowedCentres = async () => {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return [];

        const cacheKey = 'dbmci_centres_cache';
        try {
            const cStr = sessionStorage.getItem(cacheKey);
            if (cStr) {
                const cMap = JSON.parse(cStr);
                if (cMap.email === session.user.email && (Date.now() - cMap.timestamp < 3600000)) return cMap.centres;
            }
        } catch(e) {}

        let { data: userData, error: fetchErr } = await window.supabaseClient
            .from('Access')
            .select('role, centre_name')
            .eq('email_id', session.user.email)
            .single();

        if (fetchErr || !userData) {
            const retry = await window.supabaseClient.from('access').select('role, centre_name').ilike('email_id', session.user.email).single();
            userData = retry.data;
        }

        if (!userData) return [];

        let finalCentres = [];

        // Special Case: Super admin sees everything
        if (userData.role === 'Super admin') {
            const { data: all } = await window.supabaseClient.from('Centres').select('name');
            finalCentres = all ? all.map(c => c.name) : [];
        } else if (userData.role === 'Students') {
            // Special Case: Students ONLY see their own centre
            finalCentres = userData.centre_name ? [userData.centre_name] : [];
        } else {
            // Standard Case: Check Role_Centres mapping
            let res = await window.supabaseClient.from('Role_Centres').select('centre_name').eq('role_name', userData.role);
            if (res.error && (res.error.message?.includes('not find') || res.error.message?.includes('cache') || res.error.code === '42P01' || res.error.code === 'PGRST116')) {
                res = await window.supabaseClient.from('role_centres').select('centre_name').eq('role_name', userData.role);
            }
            const allowed = res.data ? res.data.map(rc => rc.centre_name) : [];
            
            if (allowed.length === 0 && userData.centre_name) {
                console.warn(`No Role_Centres mapping for ${userData.role}. Falling back to profile centre: ${userData.centre_name}`);
                finalCentres = [userData.centre_name];
            } else {
                finalCentres = allowed;
            }
        }

        sessionStorage.setItem(cacheKey, JSON.stringify({ email: session.user.email, centres: finalCentres, timestamp: Date.now() }));
        return finalCentres;
    } catch (err) {
        console.error('Centre Access Error:', err);
        return [];
    }
};

