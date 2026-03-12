document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            console.log('Login attempt:', { email, password });

            // Add premium feedback
            const button = loginForm.querySelector('.login-button');
            const originalText = button.textContent;
            button.textContent = 'Authenticating...';
            button.style.opacity = '0.7';
            button.disabled = true;

            const handleLogin = async () => {
                try {
                    // 1. Auth Login
                    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                        email: email.trim(),
                        password: password
                    });

                    if (error) {
                        alert(error.message);
                        button.textContent = originalText;
                        button.style.opacity = '1';
                        button.disabled = false;
                        return;
                    }

                    // 2. Strict Status Check from NEW table (using UUID)
                    const { data: statusData, error: dbError } = await window.supabaseClient
                        .from('User_Status')
                        .select('is_active')
                        .eq('user_id', data.user.id)
                        .single();

                    // If user is deactivated
                    if (statusData && statusData.is_active === false) {
                        alert('Your account has been deactivated. Send an email to care@dbmci.one in case of any queries');
                        await window.supabaseClient.auth.signOut();
                        button.textContent = originalText;
                        button.style.opacity = '1';
                        button.disabled = false;
                        return;
                    }

                    // 3. Successmodal - ONLY if active
                    const modal = document.getElementById('success-modal');
                    if (modal) modal.classList.add('active');

                    // 4. Role-Based Redirect
                    const userData = await window.syncUserProfile();

                    setTimeout(() => {
                        if (userData) {
                            window.redirectToDefaultPage(userData);
                        } else {
                            window.location.href = 'dashboard.html';
                        }
                    }, 1500);
                } catch (err) {
                    console.error('Login error:', err);
                    alert('An error occurred. Please try again.');
                    button.textContent = originalText;
                    button.style.opacity = '1';
                    button.disabled = false;
                }
            };
            handleLogin();
        });
    }

    // --- Forgot Password / OTP Flow ---
    const resetLink = document.getElementById('forgot-password-link');
    const resetModal = document.getElementById('reset-password-modal');
    const sendOtpBtn = document.getElementById('send-otp-btn');
    const verifyOtpStepBtn = document.getElementById('verify-otp-step-btn');
    const finalResetBtn = document.getElementById('final-reset-btn');
    const newPasswordInput = document.getElementById('new-password-val');

    if (resetLink) {
        resetLink.addEventListener('click', (e) => {
            e.preventDefault();
            resetModal.classList.add('active');
            document.getElementById('step-1-email').style.display = 'block';
            document.getElementById('step-2-otp').style.display = 'none';
            document.getElementById('step-3-password').style.display = 'none';
        });
    }

    // Step 1: Send OTP
    if (sendOtpBtn) {
        sendOtpBtn.addEventListener('click', async () => {
            const email = document.getElementById('reset-email').value;
            if (!email) return alert('Please enter your email.');
            sendOtpBtn.textContent = 'Sending...';
            sendOtpBtn.disabled = true;
            try {
                const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email.trim());
                if (error) {
                    alert(error.message);
                } else {
                    document.getElementById('step-1-email').style.display = 'none';
                    document.getElementById('step-2-otp').style.display = 'block';
                }
            } catch (err) {
                alert('Connection error.');
            } finally {
                sendOtpBtn.textContent = 'Send Code';
                sendOtpBtn.disabled = false;
            }
        });
    }

    // Step 2: Verify OTP
    if (verifyOtpStepBtn) {
        verifyOtpStepBtn.addEventListener('click', async () => {
            const email = document.getElementById('reset-email').value;
            const token = document.getElementById('reset-otp').value;
            if (!token || token.length < 6) return alert('Enter the 6-digit code.');

            verifyOtpStepBtn.textContent = 'Verifying...';
            verifyOtpStepBtn.disabled = true;
            try {
                const { error } = await window.supabaseClient.auth.verifyOtp({
                    email: email.trim(),
                    token: token.trim(),
                    type: 'recovery'
                });
                if (error) {
                    alert('Invalid or expired code.');
                } else {
                    document.getElementById('step-2-otp').style.display = 'none';
                    document.getElementById('step-3-password').style.display = 'block';
                }
            } catch (err) {
                alert('Connection error.');
            } finally {
                verifyOtpStepBtn.textContent = 'Verify & Continue';
                verifyOtpStepBtn.disabled = false;
            }
        });
    }

    // Real-time Password Validator
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', () => {
            const p = newPasswordInput.value;
            const updateReq = (id, valid) => {
                const el = document.getElementById(id);
                if (el) {
                    el.style.color = valid ? 'var(--success-color)' : '#64748b';
                    el.querySelector('.dot').style.background = valid ? 'var(--success-color)' : 'currentColor';
                }
            };
            updateReq('req-len', p.length >= 8);
            updateReq('req-up', /[A-Z]/.test(p));
            updateReq('req-num', /[0-9]/.test(p));
            updateReq('req-spec', /[^A-Za-z0-9]/.test(p));
        });
    }

    // Step 3: Final Reset
    if (finalResetBtn) {
        finalResetBtn.addEventListener('click', async () => {
            const email = document.getElementById('reset-email').value;
            const newPassword = newPasswordInput.value;
            const confirmPassword = document.getElementById('confirm-password-val').value;

            // Strict Validation
            const isWeak = newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword);
            if (isWeak) return alert('Password does not meet the security requirements.');
            if (newPassword !== confirmPassword) return alert('Passwords do not match.');

            finalResetBtn.textContent = 'Updating...';
            finalResetBtn.disabled = true;
            try {
                const { error } = await window.supabaseClient.auth.updateUser({ password: newPassword });
                if (error) {
                    alert(error.message);
                } else {
                    await window.supabaseClient.from('Access').update({ is_first_login: false }).ilike('email_id', email.trim());
                    alert('Password updated! You are now logged in.');
                    window.location.href = 'dashboard.html';
                }
            } catch (err) {
                alert('Connection error.');
            } finally {
                finalResetBtn.textContent = 'Set New Password';
                finalResetBtn.disabled = false;
            }
        });
    }
});
