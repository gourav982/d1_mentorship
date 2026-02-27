document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check Session First
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }

    // 2. ALWAYS INITIALIZE GLOBAL UI (Logout, Dropdowns)
    const profileBtn = document.getElementById('user-profile-btn');
    const nameDisplay = document.getElementById('display-name');
    const roleDisplay = document.getElementById('display-role');
    const avatarCircle = document.getElementById('avatar-circle');

    // Make dropdown work immediately
    profileBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        profileBtn.classList.toggle('active');
    });
    document.addEventListener('click', () => profileBtn?.classList.remove('active'));

    // Make Logout work immediately
    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await supabaseClient.auth.signOut();
        window.location.replace('index.html');
    });

    try {
        // 3. Fetch User Profile
        const { data: userData, error: fetchError } = await supabaseClient
            .from('Access')
            .select('*, User_Status(is_active)')
            .ilike('email_id', session.user.email)
            .single();

        if (fetchError || !userData) {
            console.warn('Profile not found for:', session.user.email);
            nameDisplay.textContent = session.user.email.split('@')[0];
            roleDisplay.textContent = 'Account Pending';
            avatarCircle.textContent = '?';
            return; // Profiles details below won't load, but logout stays active!
        }

        // 4. Auto-Sync & Status
        if (!userData.user_id) {
            await supabaseClient.from('Access').update({ user_id: session.user.id }).eq('email_id', userData.email_id);
        }

        const isActive = (userData.User_Status && userData.User_Status.is_active !== undefined)
            ? userData.User_Status.is_active : true;

        if (isActive === false) {
            await supabaseClient.auth.signOut();
            window.location.replace('index.html');
            return;
        }

        // 5. Success UI Update
        nameDisplay.textContent = userData.name || 'User';
        roleDisplay.textContent = userData.role || 'Member';
        avatarCircle.textContent = (userData.name || 'U').charAt(0).toUpperCase();

        const adminRoles = ['Super admin', 'Admin', 'Mentor', 'Academics'];
        if (adminRoles.includes(userData.role)) {
            const adminSec = document.getElementById('admin-section');
            if (adminSec) adminSec.style.display = 'block';
        }

        // 6. Modal Fill Logic
        document.getElementById('open-profile-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('profile-name').value = userData.name || '';
            document.getElementById('profile-email').value = userData.email_id || '';
            document.getElementById('profile-phone').value = userData.phone_number || '';
            document.getElementById('password-modal').classList.add('active');
        });

    } catch (err) {
        console.error('Data Load Error:', err);
    }
});
