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
    let currentResultsMap = {};

    // UI Elements for Filtering
    const dateCondition = document.getElementById('date-condition');
    const dateVal1 = document.getElementById('date-val-1');
    const dateVal2 = document.getElementById('date-val-2');
    const subjectFilter = document.getElementById('subject-filter');
    const topicSearch = document.getElementById('topic-search');
    const statusFilter = document.getElementById('status-filter');
    const clearBtn = document.getElementById('clear-filters');
    // Sidebar Toggle
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle-btn');

    // Auto-collapse on mobile initial load
    if (window.innerWidth <= 1024) {
        sidebar?.classList.add('collapsed');
    }

    sidebarToggle?.addEventListener('click', () => {
        sidebar?.classList.toggle('collapsed');
    });

    // Toggle Logic
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

    const getMonthName = (dateStr) => {
        const d = getLocalDate(dateStr);
        return d ? d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'Unknown';
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

        // 4. Status Filter
        const status = statusFilter.value;
        if (status !== 'all') {
            filtered = filtered.filter(item => {
                const userProg = currentProgressMap[item.id] || { is_done: false };
                if (status === 'pending') return !userProg.is_done;
                if (status === 'completed') return userProg.is_done;
                return true;
            });
        }

        renderSchedule(filtered, currentProgressMap);
    };

    const fetchSchedule = async () => {
        try {
            // Re-verify allowed centres for security bypass prevention
            const allowed = await window.getAllowedCentres();
            if (!allowed.includes(selectedCentre)) {
                console.warn('Unauthorized centre selection detected. Resetting...');
                selectedCentre = allowed[0] || 'Delhi';
            }

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

            // 3. Fetch Test Results for current user using Email or Enrolment ID
            const { data: resultsData } = await supabaseClient
                .from('Test_Results')
                .select('*')
                .or(`user_email.eq.${session.user.email}${currentUser.enrolment_id ? `,enrolment_id.eq.${currentUser.enrolment_id}` : ''}`);

            currentResultsMap = {};
            resultsData?.forEach(r => {
                // Store results with a composite key of type and identifier
                const typeKey = (r.test_type || 'Custom Module').trim();
                const codeKey = (r.custom_module_code || '').trim();
                currentResultsMap[`${typeKey}:${codeKey}`] = r;
            });

            // Populate Subject Dropdown
            const subjects = [...new Set(allSchedules.map(s => s.subject).filter(Boolean))].sort();
            subjectFilter.innerHTML = '<option value="all">All Subjects</option>' +
                subjects.map(s => `<option value="${s}">${s}</option>`).join('');

            applyFilters();
        } catch (err) {
            console.error('Fetch Error:', err);
            scheduleBody.innerHTML = `<tr><td colspan="12" style="text-align:center; color:#ef4444;">Error loading schedule.</td></tr>`;
        }
    };

    const renderSchedule = (schedules, progressMap) => {
        const mobileList = document.getElementById('schedule-mobile-list');
        const desktopContainer = document.querySelector('.schedule-table-container.desktop-only');
        const todayStr = new Date().toISOString().split('T')[0];

        if (!schedules || schedules.length === 0) {
            const noDataHtml = `
                <div style="text-align:center; padding: 4rem 2rem; color: var(--text-secondary); background: rgba(255,255,255,0.02); border-radius: 1rem; border: 1px dashed var(--glass-border);">
                    <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="1.5" fill="none" style="opacity: 0.3; margin-bottom: 1rem;">
                        <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <p style="font-size: 1rem; font-weight: 500;">No sessions matching your filters.</p>
                </div>`;

            if (desktopContainer) desktopContainer.innerHTML = `<div style="text-align:center; padding: 4rem; color: var(--text-secondary); background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius:1.5rem;">No sessions match your filters.</div>`;
            if (mobileList) mobileList.innerHTML = noDataHtml;
            return;
        }

        // Pre-calculate last dates for Marrow GT windows
        const gtLastDates = {};
        schedules.forEach(item => {
            const val = (item.marrow_gt && item.marrow_gt !== '-') ? item.marrow_gt : null;
            if (val) {
                if (!gtLastDates[val] || item.date > gtLastDates[val]) {
                    gtLastDates[val] = item.date;
                }
            }
        });

        const getResultsForItem = (item) => {
            const itemType = (item.type || '').trim();
            const itemCode = (item.custom_module_code || '').trim();
            const itemTopic = (item.topic || '').trim();
            let result = { score: '-', percentile: '-' };

            if (itemCode && itemCode !== '-') {
                result = currentResultsMap[`Custom Module:${itemCode}`] ||
                    currentResultsMap[`${itemType}:${itemCode}`] ||
                    result;
            }
            if (result.score === '-' && (itemType === 'T&D' || itemType === 'Marrow GT' || item.marrow_gt)) {
                result = currentResultsMap[`T&D:${itemTopic}`] ||
                    currentResultsMap[`Marrow GT:${itemTopic}`] ||
                    currentResultsMap[`Marrow GT:${item.marrow_gt}`] ||
                    result;
            }
            return result;
        };

        // Group by Month
        const monthsMap = new Map();
        schedules.forEach(item => {
            const monthKey = item.date.substring(0, 7); // YYYY-MM
            if (!monthsMap.has(monthKey)) {
                monthsMap.set(monthKey, []);
            }
            monthsMap.get(monthKey).push(item);
        });

        const sortedMonths = Array.from(monthsMap.keys()).sort();
        const currentMonthDisplay = new Date().toISOString().substring(0, 7);

        // --- Render Logic ---
        const renderMonthContent = (monthItems, isMobile) => {
            // Re-calculate rowspans per month for desktop
            const subjectRowspans = [];
            let curSub = null, subCount = 0, subStart = 0;
            monthItems.forEach((item, index) => {
                if (item.subject === curSub) { subCount++; }
                else {
                    if (curSub !== null) subjectRowspans[subStart] = subCount;
                    curSub = item.subject; subCount = 1; subStart = index;
                }
            });
            subjectRowspans[subStart] = subCount;

            const gtRowspans = [];
            let curGT = null, gtCount = 0, gtStart = 0;
            monthItems.forEach((item, index) => {
                const val = (item.marrow_gt && item.marrow_gt !== '-') ? item.marrow_gt : null;
                if (val && val === curGT) { gtCount++; }
                else {
                    if (curGT !== null) gtRowspans[gtStart] = gtCount;
                    curGT = val; gtCount = 1; gtStart = index;
                }
            });
            if (curGT !== null) gtRowspans[gtStart] = gtCount;

            if (isMobile) {
                return monthItems.map(item => {
                    const userProg = progressMap[item.id] || { is_done: false, remarks: '' };
                    const result = getResultsForItem(item);
                    const startTime = formatTime(item.start_datetime);
                    const endTime = formatTime(item.end_datetime);
                    const timing = startTime !== '-' ? `${startTime} to ${endTime}` : 'No specific timing';
                    const isLastDay = item.marrow_gt && item.marrow_gt !== '-' && item.date === gtLastDates[item.marrow_gt] && item.date === todayStr;

                    return `
                        <div class="schedule-card ${userProg.is_done ? 'is-done' : ''}" data-date="${item.date}">
                            <div class="card-row">
                                <span class="subject-badge">${item.subject || 'Study'}</span>
                                <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 600;">${formatDate(item.date)}</span>
                            </div>
                            
                            <div class="card-value" style="font-size: 1.1rem; color: var(--text-primary); margin: 0.15rem 0 0.5rem 0; line-height: 1.3;">${item.topic}</div>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 0.5rem; margin-bottom: 0.75rem; text-align: center;">
                                <div>
                                    <div class="card-label">Type</div>
                                    <div class="card-value" style="font-size: 0.8rem; opacity: 0.9;">${item.type || '-'}</div>
                                </div>
                                <div>
                                    <div class="card-label">Code</div>
                                    <div class="card-value" style="font-family: monospace; font-size: 0.8rem; opacity: 0.9;">${item.custom_module_code || '-'}</div>
                                </div>
                                <div>
                                    <div class="card-label">Test Timing</div>
                                    <div class="card-value" style="font-size: 0.75rem; line-height: 1.2;">${timing}</div>
                                </div>
                            </div>

                            ${item.marrow_gt && item.marrow_gt !== '-' ? `
                                <div style="background: rgba(34, 197, 94, 0.08); padding: 0.6rem; border-radius: 0.5rem; border: 1px solid rgba(34, 197, 94, 0.2); margin-bottom: 0.75rem; text-align: center; position: relative;">
                                    <div class="card-label" style="color: #22c55e; opacity: 1;">Marrow GT</div>
                                    <div class="card-value" style="color: #22c55e;">${item.marrow_gt}</div>
                                    ${isLastDay ? `<div style="position: absolute; top: -5px; right: -5px; background: #ef4444; color: white; font-size: 0.6rem; font-weight: 800; padding: 2px 6px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 1;">LAST DAY</div>` : ''}
                                </div>
                            ` : ''}

                            <div style="display: flex; gap: 0.5rem; margin-bottom: 0.6rem; align-items: stretch;">
                                <div style="flex: 1; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.25rem; background: rgba(255, 255, 255, 0.03); padding: 0.55rem 0.25rem; border-radius: 0.75rem; border: 1px solid rgba(255,255,255,0.05); text-align: center; align-items: center;">
                                    <div>
                                        <div class="card-label">Score</div>
                                        <div class="card-value" style="color: var(--accent-color); font-weight: 700; font-size: 0.95rem;">${result.score}</div>
                                    </div>
                                    <div style="border-left: 1px solid rgba(255,255,255,0.08); border-right: 1px solid rgba(255,255,255,0.08);">
                                        <div class="card-label">Percentile</div>
                                        <div class="card-value" style="font-weight: 600; font-size: 0.9rem;">${result.percentile}</div>
                                    </div>
                                    <div>
                                        <div class="card-label">MCQs</div>
                                        <div class="card-value" style="font-weight: 600; font-size: 0.9rem;">${item.num_questions || '-'}</div>
                                    </div>
                                </div>

                                <div style="width: 85px; display: flex; flex-direction: column; justify-content: center; align-items: center; background: rgba(56, 189, 248, 0.04); border: 1px solid rgba(56, 189, 248, 0.1); border-radius: 0.75rem; text-align: center;">
                                    <div class="card-label" style="color: var(--accent-color); opacity: 1; font-size: 0.55rem; margin-bottom: 0.15rem;">MARK DONE</div>
                                    <input type="checkbox" class="checkbox-custom" 
                                        style="transform: scale(0.9);"
                                        ${userProg.is_done ? 'checked' : ''} 
                                        onchange="window.updateProgress('${item.id}', this.checked); this.closest('.schedule-card').classList.toggle('is-done', this.checked)">
                                </div>
                            </div>

                            <div style="width: 100%;">
                                <textarea class="remarks-input" 
                                    placeholder="Add study remarks..." 
                                    onblur="window.updateRemarks('${item.id}', this.value)"
                                    oninput="this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px';"
                                    style="width: 100% !important; max-width: none !important; min-height: 42px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--glass-border); border-radius: 0.65rem; color: #fff; padding: 0.65rem 0.75rem; font-size: 0.85rem; resize: vertical !important; line-height: 1.4; overflow: hidden; display: block; box-sizing: border-box;">${userProg.remarks || ''}</textarea>
                            </div>
                        </div>`;
                }).join('');
            } else {
                // Desktop Template
                const tableRows = monthItems.map((item, index) => {
                    const userProg = progressMap[item.id] || { is_done: false, remarks: '' };
                    const result = getResultsForItem(item);
                    const subjectCell = subjectRowspans[index]
                        ? `<td rowspan="${subjectRowspans[index]}" style="vertical-align: middle; border-right: 1px solid var(--glass-border); background: rgba(255,255,255,0.02); font-weight:700; color:var(--accent-color); text-transform:uppercase; font-size:0.8rem; letter-spacing:0.05em; text-align: center;">${item.subject || '-'}</td>`
                        : '';

                    const isLastDay = item.marrow_gt && item.marrow_gt !== '-' && item.date === gtLastDates[item.marrow_gt] && item.date === todayStr;

                    const gtCell = gtRowspans[index]
                        ? `<td rowspan="${gtRowspans[index]}" style="vertical-align: middle; background: rgba(34, 197, 94, 0.05); color: #22c55e; font-weight: 600; text-align: center; border-right: 1px solid var(--glass-border); position: relative;">
                             ${item.marrow_gt}
                          </td>`
                        : (item.marrow_gt && item.marrow_gt !== '-' ? '' : '<td style="text-align: center; color: var(--text-secondary); opacity: 0.6;">-</td>');

                    // If row already has a gtCell because it's first in a group, or is a single row GT
                    let finalGtCell = gtCell;
                    if (isLastDay) {
                        // We need the "Last Day" tag to show on the SPECIFIC row that is the last day
                        // But gtCell might be rowspanned from a previous row.
                        // Actually, user says: "For Web on the last day of the window the tag can come as 'Last Day'"
                        // If it spans 5 rows, the tag should ideally be in that last row's GT cell.
                        // BUT with rowspan, the cell is in the FIRST row.
                        // Hmm. If I want it on the "last day" of the window, I might need to NOT rowspan if I want the tag there?
                        // Or just put the tag in the cell regardless.
                        if (finalGtCell.includes('rowspan')) {
                            // It's the first row of a multi-day GT. If today IS that first row AND it's the last day (1-day GT), fine.
                            // If it's a 5-day GT, today won't be the first row on the last day.
                        }
                    }

                    // Refined GT cell logic to handle the tag
                    const rowGtVal = (item.marrow_gt && item.marrow_gt !== '-') ? item.marrow_gt : null;
                    let gtDisplay = '';
                    if (rowGtVal) {
                        if (gtRowspans[index]) {
                            // Start of a group
                            gtDisplay = `<td rowspan="${gtRowspans[index]}" style="vertical-align: middle; background: rgba(34, 197, 94, 0.05); color: #22c55e; font-weight: 600; text-align: center; border-right: 1px solid var(--glass-border); position: relative;">${item.marrow_gt}`;
                            // Check if this window ENDS today. 
                            // This is tricky with rowspan. If the window ends today, the tag should be visible.
                            if (gtLastDates[rowGtVal] === todayStr) {
                                gtDisplay += `<div style="position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%); background: #ef4444; color: white; font-size: 0.6rem; padding: 2px 6px; border-radius: 4px; white-space: nowrap; z-index: 10;">LAST DAY</div>`;
                            }
                            gtDisplay += `</td>`;
                        } else if (index > 0 && monthItems[index - 1].marrow_gt === item.marrow_gt) {
                            // middle/end of group, skip cell
                            gtDisplay = '';
                        } else {
                            // Single row GT
                            gtDisplay = `<td style="vertical-align: middle; background: rgba(34, 197, 94, 0.05); color: #22c55e; font-weight: 600; text-align: center; border-right: 1px solid var(--glass-border); position: relative;">${item.marrow_gt}`;
                            if (gtLastDates[rowGtVal] === todayStr) {
                                gtDisplay += `<div style="position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%); background: #ef4444; color: white; font-size: 0.6rem; padding: 2px 6px; border-radius: 4px; white-space: nowrap; z-index: 10;">LAST DAY</div>`;
                            }
                            gtDisplay += `</td>`;
                        }
                    } else {
                        gtDisplay = '<td style="text-align: center; color: var(--text-secondary); opacity: 0.6;">-</td>';
                    }

                    let timing = '-';
                    const startTime = formatTime(item.start_datetime);
                    const endTime = formatTime(item.end_datetime);
                    if (startTime !== '-' || endTime !== '-') {
                        timing = `<span style="font-weight: 500; color: var(--text-primary);">${startTime} to ${endTime}</span>`;
                    }

                    return `
                        <tr class="schedule-row" data-date="${item.date}">
                            <td style="white-space: nowrap;">${formatDate(item.date)}</td>
                            ${subjectCell}
                            <td style="text-align: center;"><span style="font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 4px; background: rgba(255,255,255,0.05);">${item.type || 'Study Day'}</span></td>
                            <td style="min-width: 320px; max-width: 500px; white-space: normal; padding-right: 1.5rem;"><span style="font-weight: 600; line-height: 1.4; display: block;">${item.topic}</span></td>
                            ${gtDisplay}
                            <td>
                                <code style="background: rgba(255,255,255,0.05); padding: 0.2rem 0.6rem; border-radius: 0.4rem; font-family: monospace; font-size: 0.85rem;">${item.custom_module_code || '-'}</code>
                            </td>
                            <td>${timing}</td>
                            <td style="text-align: center;">
                                <span class="qs-badge" style="${(!item.num_questions || item.num_questions === 0) ? 'background:none; border:none; opacity:0.5;' : ''}">
                                    ${(item.num_questions && item.num_questions !== 0) ? item.num_questions : '-'}
                                </span>
                            </td>
                            <td style="text-align: center;"><span style="color: var(--accent-color); font-weight: 600;">${result.score}</span></td>
                            <td style="text-align: center;"><span style="color: var(--text-secondary);">${result.percentile}</span></td>
                            <td style="text-align: center;">
                                <input type="checkbox" class="checkbox-custom" 
                                    ${userProg.is_done ? 'checked' : ''} 
                                    onchange="window.updateProgress('${item.id}', this.checked)">
                            </td>
                            <td>
                                <textarea class="remarks-input" 
                                    placeholder="Add remarks..." 
                                    rows="2"
                                    onblur="window.updateRemarks('${item.id}', this.value)"
                                    style="resize: vertical; min-height: 38px;">${userProg.remarks || ''}</textarea>
                            </td>
                        </tr>`;
                }).join('');

                return `
                    <div class="schedule-table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th><th>Subject</th><th>Type</th><th>Topics</th><th style="text-align: center;">Marrow GT</th><th>Module Code</th><th>Timing</th>
                                    <th style="text-align: center;">MCQs</th><th style="text-align: center;">Score</th><th style="text-align: center;">Percentile</th><th style="text-align: center;">Done</th><th>Remarks</th>
                                </tr>
                            </thead>
                            <tbody>${tableRows}</tbody>
                        </table>
                    </div>`;
            }
        };

        const accordionHtml = sortedMonths.map(monthKey => {
            const monthItems = monthsMap.get(monthKey);
            const monthLabel = getMonthName(monthItems[0].date);
            const isCurrent = monthKey === currentMonthDisplay;

            return `
                <div class="month-accordion ${isCurrent ? 'active' : ''}" data-month="${monthKey}">
                    <div class="month-header" onclick="this.parentElement.classList.toggle('active')">
                        <span>${monthLabel}</span>
                        <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                    <div class="month-content">
                        <div class="desktop-only">${renderMonthContent(monthItems, false)}</div>
                        <div class="mobile-only">${renderMonthContent(monthItems, true)}</div>
                    </div>
                </div>`;
        }).join('');

        if (desktopContainer) desktopContainer.innerHTML = accordionHtml;
        if (mobileList) mobileList.innerHTML = accordionHtml;

        // Auto-expand remarks
        setTimeout(() => {
            document.querySelectorAll('.remarks-input').forEach(ta => {
                ta.style.height = 'auto';
                ta.style.height = ta.scrollHeight + 'px';
            });
        }, 100);

        // Scroll to Today logic
        setTimeout(() => {
            const today = todayStr;
            const isMobile = window.innerWidth <= 1024;
            const selector = isMobile ? '.schedule-card' : '.schedule-row';
            const cards = Array.from(document.querySelectorAll(selector));
            const target = cards.find(c => c.getAttribute('data-date') >= today);

            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                target.classList.add('highlighted');
                setTimeout(() => target.classList.remove('highlighted'), 3000);
            }
        }, 800);
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
    statusFilter?.addEventListener('change', applyFilters);
    clearBtn?.addEventListener('click', () => {
        dateCondition.value = 'all';
        dateVal1.value = '';
        dateVal2.value = '';
        dateVal1.style.display = 'none';
        dateVal2.style.display = 'none';
        subjectFilter.value = 'all';
        topicSearch.value = '';
        statusFilter.value = 'all';
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
        // Fetch Profile with resilience
        let { data: userData, error: fetchError } = await supabaseClient
            .from('Access')
            .select('*')
            .ilike('email_id', session.user.email)
            .single();

        if (fetchError && (fetchError.message?.includes('not find') || fetchError.code === '42P01')) {
            const { data: retryData, error: retryError } = await supabaseClient
                .from('access')
                .select('*')
                .ilike('email_id', session.user.email)
                .single();
            userData = retryData;
            fetchError = retryError;
        }

        if (fetchError || !userData) throw fetchError || new Error('Profile not found');

        currentUser = userData;
        document.body.style.display = 'block';

        // 1. Success UI Update
        nameDisplay.textContent = userData.name || 'User';
        roleDisplay.textContent = userData.role || 'Member';
        avatarCircle.textContent = (userData.name || 'U').charAt(0).toUpperCase();

        // Apply Permissions (For all roles!)
        await window.applyPermissions();

        const adminRoles = ['Super admin', 'Admin', 'Mentor', 'Academics'];
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
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Update Password';
                    }
                }
            });
        }

        // 5. Setup Filtering based on Allowed Centres
        const allowedCentres = await window.getAllowedCentres();
        const isAdmin = adminRoles.includes(userData.role);

        if (isAdmin && allowedCentres.length > 1) {
            // Show dropdown for allowed centres
            const options = allowedCentres.map(name => `<option value="${name}">${name}</option>`).join('');
            filterContainer.innerHTML = `
                <select id="centre-filter-select" class="centre-selector">
                    ${options}
                </select>
            `;
            const sel = document.getElementById('centre-filter-select');
            selectedCentre = allowedCentres[0];
            sel.value = selectedCentre;
            sel.addEventListener('change', (e) => {
                selectedCentre = e.target.value;
                fetchSchedule();
            });
        } else {
            // Single centre or student: fallback to the first allowed or their profile centre
            selectedCentre = allowedCentres[0] || userData.centre_name || 'Delhi';
            filterContainer.innerHTML = `<div class="locked-centre">Centre: ${selectedCentre}</div>`;
        }

        await fetchSchedule();

        // Scroll to Top Logic
        const mainContainer = document.querySelector('.dashboard-main');
        const scrollTopBtn = document.getElementById('scroll-to-top');

        if (mainContainer && scrollTopBtn) {
            mainContainer.addEventListener('scroll', () => {
                if (mainContainer.scrollTop > 400) {
                    scrollTopBtn.classList.add('visible');
                } else {
                    scrollTopBtn.classList.remove('visible');
                }
            });

            scrollTopBtn.addEventListener('click', () => {
                mainContainer.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            });
        }

    } catch (err) {
        console.error('Initial Load Error:', err);
        window.location.replace('index.html');
    }
});
