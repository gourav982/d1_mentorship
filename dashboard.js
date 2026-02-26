// Dashboard specific logic
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is authenticated via Supabase
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        window.location.replace('index.html');
        return;
    }

    // Fetch profile elements
    const nameDisplay = document.getElementById('display-name');
    const roleDisplay = document.getElementById('display-role');
    const avatarCircle = document.getElementById('avatar-circle');

    // 1. Fetch record by EMAIL (The most reliable source of truth currently)
    let { data: userData, error: fetchError } = await supabaseClient
        .from('Access')
        .select('*, User_Status(is_active)')
        .ilike('email_id', session.user.email)
        .single();

    if (userData) {
        // CORE FIX: Synchronize UUID if it's missing in the DB
        if (!userData.user_id) {
            console.log('🔄 Core Sync: Linking UUID to profile...');
            await supabaseClient
                .from('Access')
                .update({ user_id: session.user.id })
                .eq('email_id', userData.email_id);
        }

        // Status check
        const isActive = (userData.User_Status && userData.User_Status.is_active !== undefined)
            ? userData.User_Status.is_active : true;

        if (isActive === false) {
            await supabaseClient.auth.signOut();
            alert('Your account has been deactivated.');
            window.location.replace('index.html');
            return;
        }

        // Update UI robustly
        if (userData.name) {
            nameDisplay.textContent = userData.name;
            avatarCircle.textContent = userData.name.charAt(0).toUpperCase();
        }
        if (userData.role) {
            roleDisplay.textContent = userData.role;
        } else {
            roleDisplay.textContent = 'User'; // Generic fallback, not 'Student'
        }

        if (userData.role === 'Super admin') {
            const adminSection = document.getElementById('admin-section');
            if (adminSection) adminSection.style.display = 'block';
        }

        // Initialize profile modal data
        window.currentUserProfile = userData;

        const newPwdInput = document.getElementById('new-password');
        const confirmPwdInput = document.getElementById('confirm-password');
        const submitBtn = document.getElementById('update-pwd-submit');

        const updateSubmitState = () => {
            const hasContent = newPwdInput?.value.trim() !== '' && confirmPwdInput?.value.trim() !== '';
            if (submitBtn) {
                submitBtn.disabled = !hasContent;
                submitBtn.style.opacity = hasContent ? '1' : '0.5';
            }
        };

        newPwdInput?.addEventListener('input', updateSubmitState);
        confirmPwdInput?.addEventListener('input', updateSubmitState);

        const fillProfileData = () => {
            document.getElementById('profile-name').value = userData.name || 'Not Found';
            document.getElementById('profile-email').value = userData.email_id || session.user.email;
            document.getElementById('profile-phone').value = userData.phone_number || 'Not Added';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-password').value = '';
            updateSubmitState();
        };

        // Force password change on first login
        if (userData.is_first_login) {
            fillProfileData();
            document.getElementById('pwd-modal-title').textContent = "Welcome! Set Your Password";
            document.getElementById('pwd-modal-desc').textContent = "As this is your first login, please set a new secure password.";
            document.getElementById('password-modal').classList.add('active');
        }

        // Open Profile Modal manually handler
        document.getElementById('open-profile-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            fillProfileData();
            document.getElementById('pwd-modal-title').textContent = "My Profile";
            document.getElementById('pwd-modal-desc').textContent = "View your details and update your security settings.";
            document.getElementById('password-modal').classList.add('active');
        });
    }

    // Profile Dropdown Toggle
    const profileBtn = document.getElementById('user-profile-btn');
    if (profileBtn) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileBtn.classList.toggle('active');
        });
    }

    // Close dropdown on click outside
    document.addEventListener('click', () => profileBtn?.classList.remove('active'));

    // Handle Password Update
    const updatePwdForm = document.getElementById('update-password-form');
    updatePwdForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPwd = document.getElementById('new-password').value;
        const confirmPwd = document.getElementById('confirm-password').value;

        if (newPwd !== confirmPwd) return alert("Passwords do not match!");

        const btn = updatePwdForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Updating...';

        const result = await window.updatePasswordWithBio(newPwd, session.user.email);

        if (result.success) {
            alert('Password updated successfully!');
            document.getElementById('password-modal').classList.remove('active');
            updatePwdForm.reset();
        } else {
            alert('Error: ' + result.message);
        }
        btn.disabled = false;
        btn.textContent = 'Update Password';
    });

    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        await supabaseClient.auth.signOut();
        window.location.replace('index.html');
    });
});
