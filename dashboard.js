document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check Session
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }

    const nameDisplay = document.getElementById('display-name');
    const roleDisplay = document.getElementById('display-role');
    const avatarCircle = document.getElementById('avatar-circle');

    try {
        // 2. Fetch User Data
        const { data: userData, error: fetchError } = await supabaseClient
            .from('Access')
            .select('*, User_Status(is_active)')
            .ilike('email_id', session.user.email)
            .single();

        if (fetchError || !userData) {
            console.error('Core Fetch Error:', fetchError);
            nameDisplay.textContent = session.user.email.split('@')[0];
            roleDisplay.textContent = 'User (Offline)';
            return;
        }

        // 3. Auto-Sync UUID (The Core Security Fix)
        if (!userData.user_id) {
            await supabaseClient.from('Access').update({ user_id: session.user.id }).eq('email_id', userData.email_id);
        }

        // 4. Status Check
        const isActive = (userData.User_Status && userData.User_Status.is_active !== undefined)
            ? userData.User_Status.is_active : true;

        if (isActive === false) {
            await supabaseClient.auth.signOut();
            alert('Your account is deactivated.');
            window.location.replace('index.html');
            return;
        }

        // 5. Update UI
        nameDisplay.textContent = userData.name || 'User';
        roleDisplay.textContent = userData.role || 'Member';
        avatarCircle.textContent = (userData.name || 'U').charAt(0).toUpperCase();

        if (userData.role === 'Super admin') {
            document.getElementById('admin-section').style.display = 'block';
        }

        // 6. Modal & Profile Logic
        const fillProfileData = () => {
            document.getElementById('profile-name').value = userData.name || '';
            document.getElementById('profile-email').value = userData.email_id || '';
            document.getElementById('profile-phone').value = userData.phone_number || '';
        };

        if (userData.is_first_login) {
            fillProfileData();
            document.getElementById('password-modal').classList.add('active');
        }

        document.getElementById('open-profile-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            fillProfileData();
            document.getElementById('password-modal').classList.add('active');
        });

    } catch (err) {
        console.error('Dashboard Init Failed:', err);
    }

    // 7. Global Handlers (Logout, Dropdowns)
    const profileBtn = document.getElementById('user-profile-btn');
    profileBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        profileBtn.classList.toggle('active');
    });

    document.addEventListener('click', () => profileBtn?.classList.remove('active'));

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.replace('index.html');
    });

    // 8. Password Update
    document.getElementById('update-password-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPwd = document.getElementById('new-password').value;
        const result = await window.updatePasswordWithBio(newPwd, session.user.email);
        if (result.success) {
            alert('Updated!');
            document.getElementById('password-modal').classList.remove('active');
        } else {
            alert(result.message);
        }
    });
});
