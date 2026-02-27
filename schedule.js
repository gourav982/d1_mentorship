document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initial Auth Check
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }

    const profileBtn = document.getElementById('user-profile-btn');
    const nameDisplay = document.getElementById('display-name');
    const roleDisplay = document.getElementById('display-role');
    const avatarCircle = document.getElementById('avatar-circle');
    const filterContainer = document.getElementById('filter-container');
    const scheduleBody = document.getElementById('schedule-body');
    const adminMenuSec = document.getElementById('admin-section');

    // UI State
    let currentUser = null;
    let selectedCentre = null;

    // Dropdown Logic
    profileBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        profileBtn.classList.toggle('active');
    });
    document.addEventListener('click', () => profileBtn?.classList.remove('active'));

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await supabaseClient.auth.signOut();
        window.location.replace('index.html');
    });

    // Helper: Format Date/Time
    const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const formatTime = (dateStr) => new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const fetchSchedule = async () => {
        try {
            // Fetch Schedules for selected centre
            const { data: schedules, error: schedError } = await supabaseClient
                .from('Schedule')
                .select('*')
                .eq('centre_name', selectedCentre)
                .order('date', { ascending: true });

            if (schedError) throw schedError;

            // Fetch User's Progress
            const { data: progress, error: progError } = await supabaseClient
                .from('Schedule_Progress')
                .select('*')
                .eq('user_id', session.user.id);

            if (progError) throw progError;

            const progressMap = {};
            progress?.forEach(p => progressMap[p.schedule_id] = p);

            renderSchedule(schedules, progressMap);
        } catch (err) {
            console.error('Fetch Error:', err);
            scheduleBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error loading schedule.</td></tr>`;
        }
    };

    const renderSchedule = (schedules, progressMap) => {
        if (!schedules || schedules.length === 0) {
            scheduleBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 3rem; color: var(--text-secondary);">No sessions scheduled for ${selectedCentre}.</td></tr>`;
            return;
        }

        scheduleBody.innerHTML = schedules.map(item => {
            const userProg = progressMap[item.id] || { is_done: false, remarks: '' };
            const tooltip = `Starts: ${formatDate(item.start_datetime)} ${formatTime(item.start_datetime)}\nEnds: ${formatDate(item.end_datetime)} ${formatTime(item.end_datetime)}\nQuestions: ${item.num_questions}`;

            return `
                <tr>
                    <td style="white-space: nowrap;">${formatDate(item.date)}</td>
                    <td><span style="font-weight: 600;">${item.topic}</span></td>
                    <td>
                        <code style="background: rgba(255,255,255,0.05); padding: 0.2rem 0.5rem; border-radius: 0.4rem; font-family: monospace;">${item.custom_module_code}</code>
                        <div class="info-btn" data-tooltip="${tooltip}">i</div>
                    </td>
                    <td style="text-align: center;">
                        <input type="checkbox" class="checkbox-custom" 
                            ${userProg.is_done ? 'checked' : ''} 
                            onchange="window.updateProgress('${item.id}', this.checked)">
                    </td>
                    <td>
                        <input type="text" class="remarks-input" 
                            placeholder="Add remarks..." 
                            value="${userProg.remarks || ''}"
                            onblur="window.updateRemarks('${item.id}', this.value)">
                    </td>
                </tr>
            `;
        }).join('');
    };

    // Global Handlers for Row Interactivity
    window.updateProgress = async (scheduleId, isDone) => {
        try {
            await supabaseClient.from('Schedule_Progress').upsert({
                user_id: session.user.id,
                schedule_id: scheduleId,
                is_done: isDone,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id, schedule_id' });
        } catch (err) { console.error(err); }
    };

    window.updateRemarks = async (scheduleId, remarks) => {
        try {
            await supabaseClient.from('Schedule_Progress').upsert({
                user_id: session.user.id,
                schedule_id: scheduleId,
                remarks: remarks,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id, schedule_id' });
        } catch (err) { console.error(err); }
    };

    // Initial Load
    try {
        const { data: userData, error: fetchError } = await supabaseClient
            .from('Access')
            .select('*')
            .ilike('email_id', session.user.email)
            .single();

        if (fetchError || !userData) throw fetchError;

        currentUser = userData;
        document.body.style.display = 'block';

        // 1. Success UI Update
        nameDisplay.textContent = userData.name || 'User';
        roleDisplay.textContent = userData.role || 'Member';
        avatarCircle.textContent = (userData.name || 'U').charAt(0).toUpperCase();

        const adminRoles = ['Super admin', 'Admin', 'Mentor', 'Academics'];
        if (adminRoles.includes(userData.role) && adminMenuSec) {
            adminMenuSec.style.display = 'block';
        }

        // 2. Modal Logic
        const openModal = () => {
            const nameInput = document.getElementById('profile-name');
            const emailInput = document.getElementById('profile-email');
            if (nameInput) nameInput.value = userData.name || '';
            if (emailInput) emailInput.value = userData.email_id || '';
            document.getElementById('password-modal') ? document.getElementById('password-modal').classList.add('active') : null;
        };

        document.getElementById('open-profile-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            openModal();
        });

        // 3. Force Reset if first login
        if (userData.is_first_login) {
            openModal();
            const closeBtn = document.querySelector('.modal-close-btn');
            if (closeBtn) closeBtn.style.display = 'none';
        }

        // 4. Handle Password Update
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
                    alert('Password updated successfully! Please login again.');
                    await supabaseClient.auth.signOut();
                    window.location.replace('index.html');
                } else {
                    alert('Error: ' + result.message);
                    btn.disabled = false;
                    btn.textContent = 'Update Password';
                }
            });
        }

        // 5. Setup Filtering
        const isAdmin = adminRoles.includes(userData.role);
        if (isAdmin) {
            // Fetch Centres for dropdown
            const { data: centres } = await supabaseClient.from('Centres').select('name').order('name');
            const options = centres?.map(c => `<option value="${c.name}">${c.name}</option>`).join('') || '';

            filterContainer.innerHTML = `
                <select id="centre-filter-select" class="centre-selector">
                    ${options}
                </select>
            `;
            const sel = document.getElementById('centre-filter-select');
            selectedCentre = centres && centres.length > 0 ? centres[0].name : "Delhi";
            sel.value = selectedCentre;
            sel.addEventListener('change', (e) => {
                selectedCentre = e.target.value;
                fetchSchedule();
            });
        } else {
            selectedCentre = userData.centre_name || 'Delhi';
            filterContainer.innerHTML = `<div class="locked-centre">Centre: ${selectedCentre}</div>`;
        }

        await fetchSchedule();

    } catch (err) {
        console.error('Initial Load Error:', err);
        window.location.replace('index.html');
    }
});
