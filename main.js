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

            setTimeout(async () => {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password,
                });

                if (error) {
                    alert(error.message);
                    button.textContent = originalText;
                    button.style.opacity = '1';
                    button.disabled = false;
                } else {
                    // Check if user is active in the Access table
                    const { data: userData } = await supabaseClient
                        .from('Access')
                        .select('is_active')
                        .ilike('email_id', data.user.email)
                        .single();

                    if (userData && userData.is_active === false) {
                        alert('Your account is inactive. Please contact the administrator.');
                        await supabaseClient.auth.signOut();
                        button.textContent = originalText;
                        button.style.opacity = '1';
                        button.disabled = false;
                        return;
                    }

                    const modal = document.getElementById('success-modal');
                    if (modal) {
                        modal.classList.add('active');
                    }

                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 2000);
                }
            }, 500);
        });
    }


});
