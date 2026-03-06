document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = null;
    let allowedCentres = [];
    let selectedCentre = null;
    let currentQueries = [];
    let selectedQueryId = null;
    let activeTab = 'new'; // 'new' or 'done'

    const queryList = document.getElementById('query-list');
    const queryDetail = document.getElementById('query-detail');
    const mentorTabs = document.querySelectorAll('.query-tab');
    const centreSelect = document.getElementById('mentor-centre-select');
    const centreControls = document.getElementById('mentor-centre-controls');

    // 1. Initialize
    const init = async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        // Fetch profile
        const { data: profile } = await supabaseClient
            .from('access')
            .select('*')
            .ilike('email_id', session.user.email)
            .single();

        currentUser = profile;
        if (!currentUser) return;

        // UI Header
        document.getElementById('display-name').textContent = currentUser.name || 'User';
        document.getElementById('display-role').textContent = currentUser.role || 'Member';
        document.getElementById('avatar-circle').textContent = (currentUser.name || 'U').charAt(0).toUpperCase();

        // 2. Center Logic
        allowedCentres = await window.getAllowedCentres();
        if (allowedCentres.length > 1) {
            centreControls.style.display = 'flex';
            centreSelect.innerHTML = allowedCentres.map(c => `<option value="${c}">${c}</option>`).join('');
            selectedCentre = allowedCentres[0];
            centreSelect.value = selectedCentre;
        } else if (allowedCentres.length === 1) {
            selectedCentre = allowedCentres[0];
            document.getElementById('query-board-subtitle').textContent += ` Handling: ${selectedCentre}`;
        } else {
            selectedCentre = currentUser.centre_name || 'All';
        }

        // Apply permissions for sidebar (Admin stuff)
        window.applyPermissions();

        await fetchQueries();
    };

    // 2. Fetch Queries
    const fetchQueries = async () => {
        queryList.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">Loading student queries...</div>';

        try {
            let query = supabaseClient.from('queries').select('*').order('last_activity_at', { ascending: false });

            // Mentors see queries for their selected centre
            if (selectedCentre && selectedCentre !== 'All') {
                query = query.eq('centre_name', selectedCentre);
            }

            // Filter by tab status
            query = query.eq('status', activeTab);

            const { data, error } = await query;
            if (error) throw error;

            currentQueries = data || [];
            renderQueryList();
            updateCounts();
        } catch (err) {
            console.error('Fetch Queries Error:', err);
            queryList.innerHTML = `<div style="text-align: center; padding: 3rem; color: #ef4444;">Error: ${err.message}</div>`;
        }
    };

    const updateCounts = async () => {
        let q = supabaseClient.from('queries').select('status');
        if (selectedCentre && selectedCentre !== 'All') {
            q = q.eq('centre_name', selectedCentre);
        }

        const { data: counts } = await q;
        const newCount = counts ? counts.filter(c => c.status === 'new').length : 0;
        const doneCount = counts ? counts.filter(c => c.status === 'done').length : 0;

        const countNewEl = document.getElementById('count-new');
        const countDoneEl = document.getElementById('count-done');
        if (countNewEl) countNewEl.textContent = `(${newCount})`;
        if (countDoneEl) countDoneEl.textContent = `(${doneCount})`;
    };

    // 3. Render List
    const renderQueryList = () => {
        if (currentQueries.length === 0) {
            queryList.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-secondary); opacity: 0.6;">No queries found in this section.</div>`;
            return;
        }

        queryList.innerHTML = currentQueries.map(q => `
            <div class="query-card ${selectedQueryId === q.id ? 'active' : ''}" onclick="window.selectQuery('${q.id}')">
                <div class="query-card-header">
                    <div class="student-info">
                        <span class="student-name">${q.student_name}</span>
                        <span class="student-id">${q.student_enrolment} • ${q.centre_name}</span>
                    </div>
                    <span class="query-status status-${q.status}">${q.status}</span>
                </div>
                <div class="query-content-preview">${q.content}</div>
                <div class="query-footer">
                    <span>${new Date(q.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
            </div>
        `).join('');
    };

    // 4. Select Query
    window.selectQuery = async (id) => {
        selectedQueryId = id;
        renderQueryList(); // Update active state

        queryDetail.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">Loading details...</div>';

        const q = currentQueries.find(x => x.id === id);
        if (!q) return;

        try {
            // Fetch comments
            const { data: comments, error } = await supabaseClient
                .from('query_comments')
                .select('*')
                .eq('query_id', id)
                .order('created_at', { ascending: true });

            if (error) throw error;

            const statusButton = q.status === 'new'
                ? `<button class="btn-secondary" onclick="window.markAsDone('${q.id}')" style="font-size: 0.75rem; padding: 0.4rem 0.8rem;">Mark as Done</button>`
                : '';

            queryDetail.innerHTML = `
                <div class="detail-header">
                    <div class="student-info">
                        <h2 style="font-size: 1.1rem; font-weight: 700;">Query Interaction</h2>
                        <span class="student-id">${q.student_name} (${q.student_enrolment}) • ${q.centre_name}</span>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        ${statusButton}
                        <span class="query-status status-${q.status}">${q.status}</span>
                    </div>
                </div>
                <div class="detail-body" id="detail-body">
                    <div class="original-post">
                        <div class="comment-header">
                            <span class="comment-author">Original Post by Student</span>
                            <span>${new Date(q.created_at).toLocaleString('en-IN')}</span>
                        </div>
                        <div class="post-text">${q.content}</div>
                    </div>
                    <div class="comments-section">
                        ${comments.map(c => `
                            <div class="comment-item">
                                <div class="comment-header">
                                    <span class="comment-author">${c.author_name} <span class="comment-role-badge">${c.author_role}</span></span>
                                    <span>${new Date(c.created_at).toLocaleString('en-IN')}</span>
                                </div>
                                <div class="comment-text">${c.content}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="detail-footer">
                    <div class="comment-input-wrapper">
                        <textarea class="comment-textarea" id="comment-text-input" placeholder="Type your response to the student..."></textarea>
                        <button class="btn-send-comment" id="btn-post-comment" onclick="window.postComment('${q.id}')">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                </div>
            `;

            // Scroll to bottom
            const detailBody = document.getElementById('detail-body');
            if (detailBody) detailBody.scrollTop = detailBody.scrollHeight;

        } catch (err) {
            console.error('Detail Error:', err);
            queryDetail.innerHTML = `<div style="text-align: center; padding: 3rem; color: #ef4444;">Error: ${err.message}</div>`;
        }
    };

    // 5. Post Comment
    window.postComment = async (queryId) => {
        const input = document.getElementById('comment-text-input');
        const content = input.value.trim();
        if (!content) return;

        const btn = document.getElementById('btn-post-comment');
        btn.disabled = true;

        try {
            const { error } = await supabaseClient.from('query_comments').insert({
                query_id: queryId,
                author_email: currentUser.email_id,
                author_name: currentUser.name,
                author_role: currentUser.role,
                content: content
            });

            if (error) throw error;

            // Update last activity
            await supabaseClient.from('queries').update({
                last_activity_at: new Date().toISOString()
            }).eq('id', queryId);

            input.value = '';
            await fetchQueries();
            await window.selectQuery(queryId);
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            btn.disabled = false;
        }
    };

    // 6. Mark as Done
    window.markAsDone = async (id) => {
        if (!confirm('Mark this query as resolved?')) return;

        try {
            const { error } = await supabaseClient.from('queries').update({ status: 'done' }).eq('id', id);
            if (error) throw error;

            await fetchQueries();
            selectedQueryId = null;
            queryDetail.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); gap: 1rem; opacity: 0.6;">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <span>Query marked as done</span>
                </div>
            `;
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };

    // UI Listeners
    centreSelect?.addEventListener('change', (e) => {
        selectedCentre = e.target.value;
        fetchQueries();
    });

    mentorTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            mentorTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.dataset.tab;
            selectedQueryId = null;
            fetchQueries();
            queryDetail.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); gap: 1rem; opacity: 0.6;">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Select a query to view student interactions</span>
                </div>
            `;
        });
    });

    // Profile Dropdown
    const profileBtn = document.getElementById('user-profile-btn');
    profileBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        profileBtn.classList.toggle('active');
    });
    document.addEventListener('click', () => profileBtn?.classList.remove('active'));

    // Profile Modal
    document.getElementById('open-profile-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('profile-name').value = currentUser.name || '';
        document.getElementById('profile-email').value = currentUser.email_id || '';
        document.getElementById('profile-enrolment').value = `${currentUser.enrolment_id || 'N/A'} • ${currentUser.centre_name || 'N/A'}`;
        document.getElementById('password-modal').classList.add('active');
    });

    document.querySelector('.modal-close-btn')?.addEventListener('click', () => {
        document.getElementById('password-modal').classList.remove('active');
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await supabaseClient.auth.signOut();
        window.location.replace('index.html');
    });

    // Sidebar Toggle
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle-btn');
    sidebarToggle?.addEventListener('click', () => sidebar?.classList.toggle('collapsed'));

    // Start
    init();
});
