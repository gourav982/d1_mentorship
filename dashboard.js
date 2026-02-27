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
        const openModal = () => {
            document.getElementById('profile-name').value = userData.name || '';
            document.getElementById('profile-email').value = userData.email_id || '';
            document.getElementById('profile-phone') ? document.getElementById('profile-phone').value = userData.phone_number || '' : null;
            document.getElementById('password-modal').classList.add('active');
        };

        document.getElementById('open-profile-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            openModal();
        });

        // 7. Force Password Reset if is_first_login is TRUE
        if (userData.is_first_login) {
            openModal();
            // Optional: Hide close button to force reset
            const closeBtn = document.querySelector('.modal-close-btn');
            if (closeBtn) closeBtn.style.display = 'none';
        }

        // 8. Handle Password Update Form
        const updatePwdForm = document.getElementById('update-password-form');
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

        if (updatePwdForm) {
            updatePwdForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const newPwd = newPwdInput.value;
                const confirmPwd = confirmPwdInput.value;

                if (newPwd !== confirmPwd) {
                    alert("Passwords do not match!");
                    return;
                }

                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Updating...';
                }

                const result = await window.updatePasswordWithBio(newPwd, userData.email_id);

                if (result.success) {
                    alert('Password updated successfully! Please login again with your new password.');
                    await supabaseClient.auth.signOut();
                    window.location.replace('index.html');
                } else {
                    alert('Error: ' + result.message);
                    btn.disabled = false;
                    btn.textContent = 'Update Password';
                }
            });
        }

    } catch (err) {
        console.error('Data Load Error:', err);
    }
});
