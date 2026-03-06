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
        // Sync Profile and Apply Sidebar Permissions
        currentUser = await window.syncUserProfile();
        if (!currentUser) {
            // Re-fetch just in case
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) currentUser = await window.syncUserProfile();
        }

        await window.applyPermissions();

        if (!currentUser) return;

        // 2. Center Logic
        allowedCentres = await window.getAllowedCentres();

        if (allowedCentres.length > 1) {
            centreControls.style.display = 'flex';
            centreSelect.innerHTML = allowedCentres.map(c => `<option value="${c}">${c}</option>`).join('');
            selectedCentre = allowedCentres[0];
            centreSelect.value = selectedCentre;
        } else if (allowedCentres.length === 1) {
            selectedCentre = allowedCentres[0];
            const boardSubtitle = document.getElementById('query-board-subtitle');
            if (boardSubtitle) boardSubtitle.textContent = `Handling queries for: ${selectedCentre}`;
        } else {
            selectedCentre = currentUser.centre_name || 'All';
        }

        await fetchQueries();
    };

    // 2. Fetch Queries
    const fetchQueries = async () => {
        queryList.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">Loading student queries...</div>';

        try {
            let queryBuilder = supabaseClient.from('queries').select('*').order('last_activity_at', { ascending: false });

            // Mentors see queries for their selected centre
            if (selectedCentre && selectedCentre !== 'All') {
                queryBuilder = queryBuilder.eq('centre_name', selectedCentre);
            }

            // Filter by tab status
            queryBuilder = queryBuilder.eq('status', activeTab);

            const { data, error } = await queryBuilder;
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
        try {
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
        } catch (e) {
            console.warn('Count update failed:', e);
        }
    };

    // 3. Render List
    const renderQueryList = () => {
        if (currentQueries.length === 0) {
            queryList.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--text-secondary); opacity: 0.6;">No queries found.</div>`;
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
                    <span>${new Date(q.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                </div>
            </div>
        `).join('');
    };

    // 4. Select Query
    window.selectQuery = async (id) => {
        selectedQueryId = id;
        renderQueryList();

        const qListColumn = document.querySelector('.query-column');
        if (qListColumn) qListColumn.classList.add('mobile-hidden');

        queryDetail.classList.remove('mobile-hidden');
        queryDetail.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);">Loading conversation...</div>';

        const q = currentQueries.find(x => x.id === id);
        if (!q) return;

        try {
            const { data: comments, error } = await supabaseClient
                .from('query_comments')
                .select('*')
                .eq('query_id', id)
                .order('created_at', { ascending: true });

            if (error) throw error;

            const statusButton = q.status === 'new'
                ? `<button class="btn-secondary" onclick="window.markAsDone('${q.id}')" style="font-size: 0.75rem; padding: 0.4rem 0.8rem; border-radius: 0.5rem;">Mark as Done</button>`
                : '';

            queryDetail.innerHTML = `
                <div class="detail-header" style="padding: 1rem 1.25rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <button class="icon-btn mobile-only" onclick="window.closeDetail()" style="margin-right: 0.5rem; color: var(--accent-color);">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="19" y1="12" x2="5" y2="12"></line>
                                <polyline points="12 19 5 12 12 5"></polyline>
                            </svg>
                        </button>
                        <div class="student-info">
                            <h2 style="font-size: 1rem; font-weight: 700; margin: 0; color: #fff;">${q.student_name}</h2>
                            <span class="student-id" style="color: var(--text-secondary); font-size: 0.75rem;">${q.student_enrolment} • ${q.centre_name}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.75rem; align-items: center;">
                        ${statusButton}
                        <span class="query-status status-${q.status}" style="font-size: 0.7rem;">${q.status}</span>
                    </div>
                </div>
                <div class="detail-body" id="detail-body" style="padding: 1rem;">
                    <div class="original-post" style="padding: 1rem; border-radius: 0.75rem; background: rgba(56, 189, 248, 0.05); border: 1px solid rgba(56, 189, 248, 0.1); margin-bottom: 1rem;">
                    <div class="comment-header" style="margin-bottom: 0.5rem; border-bottom: none; padding-bottom: 0;">
                        <span class="comment-author" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Student's Question</span>
                        <span style="font-size: 0.75rem;">${new Date(q.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    </div>
                    <div class="post-text" style="font-size: 0.95rem; line-height: 1.5; color: #e2e8f0;">${q.content}</div>
                </div>
                <div class="comments-section" style="display: flex; flex-direction: column; gap: 0.75rem;">
                        ${comments.map(c => `
                            <div class="comment-item" style="padding: 0.85rem; border-radius: 0.75rem; border: 1px solid var(--glass-border); background: ${c.author_role === 'Mentor' ? 'rgba(56, 189, 248, 0.03)' : 'rgba(255, 255, 255, 0.02)'}">
                                <div class="comment-header" style="margin-bottom: 0.4rem; border-bottom: none; padding-bottom: 0;">
                                    <span class="comment-author" style="font-size: 0.85rem;">${c.author_name} <span class="comment-role-badge" style="font-size: 0.65rem; padding: 0.1rem 0.4rem;">${c.author_role}</span></span>
                                    <span style="font-size: 0.7rem; opacity: 0.6;">${new Date(c.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                </div>
                                <div class="comment-text" style="font-size: 0.9rem; line-height: 1.4; color: #cbd5e1;">${c.content}</div>
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

            const body = document.getElementById('detail-body');
            if (body) body.scrollTop = body.scrollHeight;

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

    window.markAsDone = async (id) => {
        if (!confirm('Resolve this student query?')) return;
        try {
            const { error } = await supabaseClient.from('queries').update({ status: 'done' }).eq('id', id);
            if (error) throw error;
            await fetchQueries();
            selectedQueryId = null;
            queryDetail.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); gap: 1rem; opacity: 0.6;">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>Query marked as resolved</span>
                </div>
            `;
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };

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
                    <span>Select a student query to respond</span>
                </div>
            `;
        });
    });

    // Profile Modals
    const profileBtn = document.getElementById('user-profile-btn');
    profileBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        profileBtn.classList.toggle('active');
    });
    document.addEventListener('click', () => profileBtn?.classList.remove('active'));

    document.getElementById('open-profile-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('password-modal').classList.add('active');
    });

    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await supabaseClient.auth.signOut();
        window.location.replace('index.html');
    });

    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle-btn');
    sidebarToggle?.addEventListener('click', () => sidebar?.classList.toggle('collapsed'));

    init();
});
