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

                    // 2. Check deactivation status strictly
                    const { data: userData } = await window.supabaseClient
                        .from('Access')
                        .select('is_active')
                        .ilike('email_id', data.user.email)
                        .single();

                    if (userData && userData.is_active === false) {
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

                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 2000);
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
});
