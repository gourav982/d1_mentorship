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
                    const modal = document.getElementById('success-modal');
                    if (modal) {
                        modal.classList.add('active');
                    }

                    // Redirect after 3 seconds
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 3000);
                }
            }, 500);
        });
    }


});
