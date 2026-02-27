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
    let allSchedules = [];
    let currentProgressMap = {};

    // UI Elements for Filtering
    const dateCondition = document.getElementById('date-condition');
    const dateVal1 = document.getElementById('date-val-1');
    const dateVal2 = document.getElementById('date-val-2');
    const subjectFilter = document.getElementById('subject-filter');
    const topicSearch = document.getElementById('topic-search');
    const clearBtn = document.getElementById('clear-filters');

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

    // Helper: Safe Date/Time (Treats everything as LOCAL literal time to prevent shifts)
    const getLocalDate = (str) => {
        if (!str || str === 'null' || str === 'undefined') return null;

        // Strip out 'Z' or '+00' or any timezone offset to force local interpretation of the literal string
        let normalized = str.toString().replace(/Z$|\+\d{2}(:?\d{2})?$/, '');

        if (normalized.includes(' ')) {
            normalized = normalized.replace(' ', 'T');
        } else if (!normalized.includes('T') && /^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
            normalized = `${normalized}T00:00:00`;
        }

        const d = new Date(normalized);
        if (isNaN(d.getTime())) return null;
        return d;
    };

    const formatDate = (dateStr) => {
        const d = getLocalDate(dateStr);
        return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
    };

    const formatTime = (dateStr) => {
        const d = getLocalDate(dateStr);
        return d ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-';
    };

    const applyFilters = () => {
        let filtered = allSchedules;

        // 1. Date Filter
        const cond = dateCondition.value;
        const v1 = dateVal1.value;
        const v2 = dateVal2.value;

        if (cond !== 'all' && v1) {
            filtered = filtered.filter(item => {
                const itemDate = item.date; // YYYY-MM-DD
                if (cond === 'on') return itemDate === v1;
                if (cond === 'before') return itemDate < v1;
                if (cond === 'after') return itemDate > v1;
                if (cond === 'since') return itemDate >= v1;
                if (cond === 'between' && v2) return itemDate >= v1 && itemDate <= v2;
                return true;
            });
        }

        // 2. Subject Filter
        const sub = subjectFilter.value;
        if (sub !== 'all') {
            filtered = filtered.filter(item => item.subject === sub);
        }

        // 3. Topic Search
        const search = topicSearch.value.toLowerCase().trim();
        if (search) {
            filtered = filtered.filter(item =>
                (item.topic || '').toLowerCase().includes(search) ||
                (item.subject || '').toLowerCase().includes(search)
            );
        }

        renderSchedule(filtered, currentProgressMap);
    };

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

            allSchedules = schedules || [];
            currentProgressMap = {};
            progress?.forEach(p => currentProgressMap[p.schedule_id] = p);

            // Populate Subject Dropdown
            const subjects = [...new Set(allSchedules.map(s => s.subject).filter(Boolean))].sort();
            subjectFilter.innerHTML = '<option value="all">All Subjects</option>' +
                subjects.map(s => `<option value="${s}">${s}</option>`).join('');

            applyFilters();
        } catch (err) {
            console.error('Fetch Error:', err);
            scheduleBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#ef4444;">Error loading schedule.</td></tr>`;
        }
    };

    const renderSchedule = (schedules, progressMap) => {
        if (!schedules || schedules.length === 0) {
            scheduleBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 3rem; color: var(--text-secondary);">No sessions match your filters.</td></tr>`;
            return;
        }

        // Calculate Rowspan for Subjects (only when not searching/filtering heavily to maintain UI sanity)
        const subjectRowspans = [];
        let currentSubject = null;
        let count = 0;
        let startIndex = 0;

        schedules.forEach((item, index) => {
            if (item.subject === currentSubject) {
                count++;
            } else {
                if (currentSubject !== null) {
                    subjectRowspans[startIndex] = count;
                }
                currentSubject = item.subject;
                count = 1;
                startIndex = index;
            }
        });
        subjectRowspans[startIndex] = count;

        scheduleBody.innerHTML = schedules.map((item, index) => {
            const userProg = progressMap[item.id] || { is_done: false, remarks: '' };

            const subjectCell = subjectRowspans[index]
                ? `<td rowspan="${subjectRowspans[index]}" style="vertical-align: middle; border-right: 1px solid var(--glass-border); background: rgba(255,255,255,0.02); font-weight:700; color:var(--accent-color); text-transform:uppercase; font-size:0.8rem; letter-spacing:0.05em;">${item.subject || '-'}</td>`
                : '';

            const timing = `
                <div style="font-weight: 600;">${formatTime(item.start_datetime)}</div>
                <div class="timing-info">to ${formatTime(item.end_datetime)}</div>
            `;

            return `
                <tr>
                    <td style="white-space: nowrap;">${formatDate(item.date)}</td>
                    ${subjectCell}
                    <td><span style="font-weight: 600;">${item.topic}</span></td>
                    <td>
                        <code style="background: rgba(255,255,255,0.05); padding: 0.2rem 0.6rem; border-radius: 0.4rem; font-family: monospace; font-size: 0.85rem;">${item.custom_module_code || '-'}</code>
                    </td>
                    <td style="white-space: nowrap;">${timing}</td>
                    <td style="text-align: center;"><span class="qs-badge">${item.num_questions || 0}</span></td>
                    <td style="text-align: center;">
                        <input type="checkbox" class="checkbox-custom" 
                            ${userProg.is_done ? 'checked' : ''} 
                            onchange="window.updateProgress('${item.id}', this.checked)">
                    </td>
                    <td>
                        <textarea class="remarks-input" 
                            placeholder="Add remarks..." 
                            rows="1"
                            onblur="window.updateRemarks('${item.id}', this.value)"
                            style="resize: vertical; min-height: 38px;">${userProg.remarks || ''}</textarea>
                    </td>
                </tr>
            `;
        }).join('');
    };

    // Filter Event Listeners
    dateCondition?.addEventListener('change', () => {
        const val = dateCondition.value;
        dateVal1.style.display = (val !== 'all') ? 'block' : 'none';
        dateVal2.style.display = (val === 'between') ? 'block' : 'none';
        applyFilters();
    });
    [dateVal1, dateVal2, subjectFilter].forEach(el => el?.addEventListener('change', applyFilters));
    topicSearch?.addEventListener('input', applyFilters);
    clearBtn?.addEventListener('click', () => {
        dateCondition.value = 'all';
        dateVal1.value = '';
        dateVal2.value = '';
        dateVal1.style.display = 'none';
        dateVal2.style.display = 'none';
        subjectFilter.value = 'all';
        topicSearch.value = '';
        applyFilters();
    });

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
            let { data: centres, error } = await supabaseClient.from('Centres').select('name').order('name');

            // Fallback to Access table
            if (error || !centres || centres.length === 0) {
                const { data: accessData } = await supabaseClient.from('Access').select('centre_name');
                if (accessData) {
                    const unique = [...new Set(accessData.map(u => u.centre_name).filter(Boolean))];
                    centres = unique.sort().map(name => ({ name }));
                }
            }

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
