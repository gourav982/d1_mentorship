document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize State
    let allOnboardingData = [];
    let currentSort = { col: 'created_at', asc: false };
    
    const tableBody = document.getElementById('onboarding-body');
    const searchInput = document.getElementById('onboarding-search');
    const countDisplay = document.getElementById('onboarding-count');
    const centreSelect = document.getElementById('centre-select');

    // 2. Auth & Sidebar Security
    const userData = await window.syncUserProfile();
    if (!userData || (userData.role !== 'Admin' && userData.role !== 'Super admin')) {
        console.error("Access Denied: Admin role required.");
        window.location.replace('dashboard.html');
        return;
    }
    document.body.style.display = 'block';

    // 3. Populate Sidebar 
    const sidebarContainer = document.getElementById('sidebar-nav-container');
    if (sidebarContainer) {
        sidebarContainer.innerHTML = `
            <div class="nav-section">
                <div class="nav-group" onclick="toggleNavGroup(this)">
                    <span>Main Menu</span>
                    <svg class="nav-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <div class="nav-items-container">
                    <a href="dashboard.html" class="nav-item" data-permission="page_dashboard">Performance Homepage</a>
                    <a href="schedule.html" class="nav-item" data-permission="page_schedule">Schedule</a>
                </div>
            </div>

            <div class="nav-section">
                <div class="nav-group" onclick="toggleNavGroup(this)">
                    <span>Mentorship</span>
                    <svg class="nav-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <div class="nav-items-container">
                    <a href="queries.html" class="nav-item" data-permission="page_queries">Put your Query</a>
                    <a href="book-session.html" class="nav-item" data-permission="page_book_session">Book a Session</a>
                </div>
            </div>

            <div class="nav-section">
                <div class="nav-group" onclick="toggleNavGroup(this)">
                    <span>Mentor's Corner</span>
                    <svg class="nav-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <div class="nav-items-container">
                    <a href="mentor-queries.html" class="nav-item" data-permission="page_mentor_queries">Student's Query</a>
                    <a href="mentor-performance.html" class="nav-item" data-permission="page_student_performance">Student Performance</a>
                </div>
            </div>

            <div class="nav-section">
                <div class="nav-group" onclick="toggleNavGroup(this)">
                    <span>Centre's Corner</span>
                    <svg class="nav-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <div class="nav-items-container">
                    <a href="centre-performance.html" class="nav-item" data-permission="page_centre_batch_performance">Batch Performance</a>
                    <a href="centre-student-deepdive.html" class="nav-item" data-permission="page_centre_student_deepdive">Student Deepdive</a>
                    <a href="centre-analytics.html" class="nav-item" data-permission="page_centre_analytics">Centre Analytics</a>
                    <a href="centre-test-summary.html" class="nav-item" data-permission="page_centre_test_summary">Test Summary</a>
                </div>
            </div>

            <div class="admin-only" id="admin-section">
                <div class="nav-section expanded">
                    <div class="nav-group" onclick="toggleNavGroup(this)">
                        <span>Admin Corner</span>
                        <svg class="nav-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    <div class="nav-items-container expanded">
                        <a href="admin-users.html" class="nav-item" data-permission="page_users">Users & Roles</a>
                        <a href="role-management.html" class="nav-item super-admin-only" data-permission="page_permissions">Role Permissions</a>
                        <a href="upload-schedule.html" class="nav-item" data-permission="page_upload_schedule">Upload Schedule</a>
                        <a href="upload-results.html" class="nav-item" data-permission="page_upload_results">Upload Results</a>
                        <a href="manage-centres.html" class="nav-item" data-permission="page_manage_centres">Manage Centres</a>
                        <a href="admin-mentor-profile.html" class="nav-item" data-permission="page_mentor_profile">Mentor Profile</a>
                        <a href="admin-onboarding-data.html" class="nav-item active">Onboarding Data</a>
                    </div>
                </div>
            </div>
        `;
        window.applyPermissions();
    }

    // 4. Load Centres
    const loadCentres = async () => {
        const { data } = await window.supabaseClient.from('Centres').select('name').order('name');
        if (data) {
            centreSelect.innerHTML = `<option value="" style="color:#000;">Select Centre</option>` +
                data.map(c => `<option value="${c.name}" style="color:#000;">${c.name}</option>`).join('') +
                `<option value="all" style="color:#000;">All Centres</option>`;
        }
    };

    // 5. Fetch Data
    const fetchData = async (selectedCentre) => {
        if (!selectedCentre) {
            tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 5rem; color: var(--text-secondary);">Select a centre to load responses.</td></tr>`;
            countDisplay.textContent = '0';
            return;
        }

        tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 5rem; color: var(--text-secondary);"><div class="loading-spinner" style="margin: 0 auto 1rem auto;"></div>Loading data...</td></tr>`;

        try {
            let studentQuery = window.supabaseClient.from('Access').select('name, enrolment_id, email_id, onboarding_date');
            if (selectedCentre !== 'all') studentQuery = studentQuery.eq('centre_name', selectedCentre);
            
            let { data: students, error: stdErr } = await studentQuery;
            if (stdErr) throw stdErr;

            if (!students || students.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 3rem; opacity: 0.5;">No students found for this centre.</td></tr>`;
                countDisplay.textContent = '0';
                return;
            }

            const studentMap = {};
            students.forEach(s => studentMap[String(s.email_id).toLowerCase()] = s);
            const emailIds = students.map(s => s.email_id);

            const { data: onboardingRows, error: onboardingErr } = await window.supabaseClient
                .from('Onboarding_Data')
                .select('*')
                .in('email_id', emailIds);

            if (onboardingErr) throw onboardingErr;

            allOnboardingData = onboardingRows.map(row => {
                const s = studentMap[String(row.email_id).toLowerCase()] || {};
                return {
                    ...row,
                    name: s.name || 'Unknown',
                    enrolment_id: s.enrolment_id || '-',
                    onboarding_date: s.onboarding_date || null,
                    Access: s
                };
            });

            applySorting();
            renderTable(allOnboardingData);
            countDisplay.textContent = allOnboardingData.length;
        } catch (err) {
            console.error(err);
            tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #ef4444; padding: 2rem;">Error: ${err.message}</td></tr>`;
        }
    };

    // 6. Sorting Logic
    window.toggleSort = (column) => {
        if (currentSort.col === column) {
            currentSort.asc = !currentSort.asc;
        } else {
            currentSort.col = column;
            currentSort.asc = true;
        }
        
        // Update UI Icons
        document.querySelectorAll('.sort-icon').forEach(icon => {
            icon.className = 'sort-icon';
        });
        const activeIcon = document.getElementById(`sort-${column}`);
        if (activeIcon) {
            activeIcon.classList.add(currentSort.asc ? 'sort-asc' : 'sort-desc');
        }

        applySorting();
        renderTable(allOnboardingData);
    };

    const applySorting = () => {
        allOnboardingData.sort((a, b) => {
            let valA = a[currentSort.col];
            let valB = b[currentSort.col];

            // Specific handling for dates
            if (currentSort.col === 'created_at') {
                valA = new Date(valA || 0);
                valB = new Date(valB || 0);
            }
            
            // Numeric handling
            if (typeof valA === 'number' && typeof valB === 'number') {
                return currentSort.asc ? valA - valB : valB - valA;
            }

            // String string handling
            valA = String(valA || "").toLowerCase();
            valB = String(valB || "").toLowerCase();
            
            if (valA < valB) return currentSort.asc ? -1 : 1;
            if (valA > valB) return currentSort.asc ? 1 : -1;
            return 0;
        });
    };

    // 7. Render Logic
    const renderTable = (items) => {
        if (!items.length) {
            tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 3rem; opacity: 0.5;">No data matching those filters.</td></tr>`;
            return;
        }

        tableBody.innerHTML = items.map((item, idx) => {
            const dateStr = item.onboarding_date ? new Date(item.onboarding_date).toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric'
            }) : '-';

            const score = item.latest_gt_score !== null ? item.latest_gt_score : '-';
            const percentile = item.latest_gt_percentile !== null ? `${item.latest_gt_percentile}%` : '-';

            return `
                <tr>
                    <td style="font-family: monospace; font-weight: 600; color: var(--accent-color);">${item.enrolment_id}</td>
                    <td style="font-weight: 600; color: #fff;">${item.name}</td>
                    <td style="font-size: 0.8rem;">${item.target_exam || '-'}</td>
                    <td>${item.target_rank || '-'}</td>
                    <td style="font-weight: 600; color: var(--accent-color);">${score}</td>
                    <td style="color: var(--text-secondary);">${percentile}</td>
                    <td>${renderExpandableText(item.biggest_challenge, `challenge-${idx}`)}</td>
                    <td>${renderExpandableText(item.mentorship_expectation, `expect-${idx}`)}</td>
                    <td style="font-size: 0.8rem; color: var(--text-secondary);">${dateStr}</td>
                </tr>
            `;
        }).join('');

        document.querySelectorAll('.read-more-btn').forEach(btn => {
            btn.onclick = () => {
                const textContainer = document.getElementById(btn.getAttribute('data-target'));
                const cell = textContainer.closest('td');
                const isExpanded = textContainer.classList.toggle('expanded');
                
                // Allow row to grow if expanded
                if (isExpanded) {
                    cell.parentElement.style.height = 'auto';
                    cell.style.height = 'auto';
                } else {
                    cell.parentElement.style.height = '70px';
                    cell.style.height = '70px';
                }
                
                btn.textContent = isExpanded ? 'Show Less' : 'Read More';
            };
        });
    };

    const renderExpandableText = (text, id) => {
        if (!text) return '<div class="details-wrapper"><span style="opacity: 0.3;">-</span></div>';
        if (text.length < 50) return `<div class="details-wrapper"><div>${text}</div></div>`;
        return `
            <div class="details-wrapper">
                <div id="${id}" class="details-text">${text}</div>
                <button class="read-more-btn" data-target="${id}">Read More</button>
            </div>
        `;
    };

    centreSelect.onchange = (e) => fetchData(e.target.value);
    searchInput.oninput = (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = allOnboardingData.filter(item => 
            item.name.toLowerCase().includes(query) || item.enrolment_id.toLowerCase().includes(query)
        );
        renderTable(filtered);
    };

    loadCentres();
    fetchData("");
});
