document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signup-form');

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const phone = document.getElementById('phone').value;
            const password = document.getElementById('password').value;

            const button = signupForm.querySelector('.login-button');
            const originalText = button.textContent;
            button.textContent = 'Creating Account...';
            button.style.opacity = '0.7';
            button.disabled = true;

            // 1. Create Supabase Auth Account
            const { data: authData, error: authError } = await supabaseClient.auth.signUp({
                email: email,
                password: password,
            });

            if (authError) {
                alert('Auth Error: ' + authError.message);
                button.textContent = originalText;
                button.style.opacity = '1';
                button.disabled = false;
                return;
            }

            // 2. Insert into the "Access" table
            const { error: dbError } = await supabaseClient
                .from('Access')
                .insert([
                    {
                        name: name,
                        email_id: email,
                        phone_number: phone,
                        password: password,
                        role: 'Students'
                    }
                ]);

            if (dbError) {
                alert('Database Error: ' + dbError.message);
                button.textContent = originalText;
                button.style.opacity = '1';
                button.disabled = false;
            } else {
                const modal = document.getElementById('success-modal');
                if (modal) {
                    modal.classList.add('active');
                }

                // Redirect to login after a delay
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 4000);
            }
        });
    }


});
