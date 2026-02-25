// Dashboard specific logic
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is authenticated via Supabase
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        window.location.replace('index.html');
        return;
    }

    // Fetch full user data including first login flag and bio info
    const userNameElement = document.querySelector('.profile-info .name');
    const { data: userData } = await supabaseClient
        .from('Access')
        .select('name, role, is_first_login, phone_number, email_id')
        .eq('email_id', session.user.email)
        .single();

    if (userData) {
        if (userData.name) userNameElement.textContent = userData.name;

        const roleElement = document.querySelector('.profile-info .role');
        if (roleElement && userData.role) {
            roleElement.textContent = userData.role;
        }

        if (userData.role === 'Super admin') {
            const adminSection = document.getElementById('admin-section');
            if (adminSection) adminSection.style.display = 'block';
        }

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

        // Pre-fill profile data for the modal
        const fillProfileData = () => {
            document.getElementById('profile-name').value = userData.name || '';
            document.getElementById('profile-email').value = userData.email_id || session.user.email;
            document.getElementById('profile-phone').value = userData.phone_number || '';
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
