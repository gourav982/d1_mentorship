document.addEventListener('DOMContentLoaded', async () => {
    const client = window.supabaseClient;
    if (!client) return;
    
    let currentUser = null;
    let centreStudents = [];
    let centreSchedules = [];
    let centreResults = [];

    let currentSort = {
        daily: { col: 'name', asc: true },
        td: { col: 'name', asc: true },
        gt: { col: 'name', asc: true }
    };

    // TABS LOGIC
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.analytics-content');
    tabs.forEach(t => {
        t.addEventListener('click', () => {
            tabs.forEach(btn => btn.classList.remove('active'));
            contents.forEach(content => content.classList.remove('active'));
            t.classList.add('active');
            document.getElementById(t.dataset.tab).classList.add('active');
        });
    });

    const formatChartDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        const day = d.getDate().toString().padStart(2, '0');
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${day}-${months[d.getMonth()]}`;
    };

    const init = async () => {
        currentUser = await window.syncUserProfile();
        await window.applyPermissions();

        // 1. Initial UI Bindings Config
        const profileBtn = document.getElementById('user-profile-btn');
        profileBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            profileBtn.classList.toggle('active');
        });
        document.addEventListener('click', () => profileBtn?.classList.remove('active'));

        document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await client.auth.signOut();
            window.location.replace('index.html');
        });

        const sidebar = document.querySelector('.sidebar');
        const sidebarToggle = document.getElementById('sidebar-toggle-btn');
        sidebarToggle?.addEventListener('click', () => sidebar?.classList.toggle('collapsed'));

        document.getElementById('open-profile-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('password-modal').classList.add('active');
        });

        // Load Data Let's limit strictly to the Coordinator's centre, unless Super Admin
        let queryCentre = currentUser.centre_name;
        if (currentUser.role === 'Super admin' || currentUser.role === 'Admin') {
            const ctFilterContainer = document.getElementById('admin-centre-filter-container');
            if (ctFilterContainer) ctFilterContainer.style.display = 'flex';
            
            // fetch centres
            let { data: centres, error: centresError } = await client.from('Centres').select('name').order('name', { ascending: true });
            if (centresError && (centresError.code === 'PGRST116' || centresError.message.includes('schema cache'))) {
                const { data: accessData } = await client.from('Access').select('centre_name');
                if (accessData) {
                    const unique = [...new Set(accessData.map(u => u.centre_name).filter(Boolean))];
                    centres = unique.map(name => ({ name }));
                } else {
                    centres = [];
                }
            } else if (!centres) {
                centres = [];
            }

            if(centres.length > 0) {
                const uniqueCentres = [...new Set(centres.map(c => c.name))].sort();
                const ctFilter = document.getElementById('admin-centre-filter');
                if (ctFilter) {
                    ctFilter.innerHTML = `<option value="">All Centres</option>` + uniqueCentres.map(c => `<option value="${c}">${c}</option>`).join('');
                    ctFilter.addEventListener('change', (e) => fetchGlobalData(e.target.value || null));
                }
            }
             queryCentre = null; 
        }

        await fetchGlobalData(queryCentre);
    };

    const fetchGlobalData = async (centreStr) => {
        try {
            // FETCH STUDENTS
            let q = client.from('access').select('enrolment_id, name, email_id, centre_name').ilike('role', 'student%');
            if (centreStr) q = q.ilike('centre_name', centreStr);
            const { data: stdData, error: stdErr } = await q;

            // Handle capitalization mismatch for `Access`
            if (stdErr || !stdData) {
                let q2 = client.from('Access').select('enrolment_id, name, email_id, centre_name').ilike('role', 'student%');
                if (centreStr) q2 = q2.ilike('centre_name', centreStr);
                const retry = await q2;
                centreStudents = retry.data || [];
            } else {
                centreStudents = stdData;
            }

            // FETCH SCHEDULES
            let sQ = client.from('Schedule').select('*');
            if (centreStr) sQ = sQ.ilike('centre_name', centreStr);
            const { data: schedData } = await sQ;
            centreSchedules = schedData || [];

            // FETCH RESULTS
            // Results map via email or enrolment_id.
            const { data: resData } = await client.from('Test_Results').select('*');
            centreResults = resData || [];

            buildFilters();
        } catch (e) {
            console.error(e);
        }
    };

    const buildFilters = () => {
        const dSelect = document.getElementById('daily-select');
        const tdSelect = document.getElementById('td-select');
        const gtSelect = document.getElementById('gt-select');
        const dailyDateFilter = document.getElementById('daily-date-filter');
        const dContainer = document.getElementById('date-inputs-container');
        const d1 = document.getElementById('date-input-1');
        const d2 = document.getElementById('date-input-2');
        const sep = document.getElementById('date-separator');

        const updateDailyTestsOptions = () => {
            const filterType = dailyDateFilter ? dailyDateFilter.value : 'all';
            
            // Manage UI
            if (filterType === 'all') {
                dContainer.style.display = 'none';
            } else {
                dContainer.style.display = 'flex';
                if (filterType === 'between') {
                    d2.style.display = 'block';
                    sep.style.display = 'block';
                } else {
                    d2.style.display = 'none';
                    sep.style.display = 'none';
                }
            }

            const codeMap = {};
            centreSchedules.forEach(s => {
                const code = s.custom_module_code;
                if(code && code.trim() !== '-' && code.trim() !== '') {
                    if(!codeMap[code] || (codeMap[code].date < s.date)) {
                        codeMap[code] = { code, date: s.date };
                    }
                }
            });

            let dailyList = Object.values(codeMap);

            if (filterType !== 'all') {
                const val1 = d1.value ? new Date(d1.value) : null;
                const val2 = d2.value ? new Date(d2.value) : null;

                if (val1 && !isNaN(val1)) {
                    val1.setHours(0,0,0,0);
                    dailyList = dailyList.filter(d => {
                        if (!d.date) return false;
                        const testDate = new Date(d.date);
                        testDate.setHours(0,0,0,0);

                        switch(filterType) {
                            case 'on': return testDate.getTime() === val1.getTime();
                            case 'before': return testDate < val1;
                            case 'after': return testDate > val1;
                            case 'since': return testDate >= val1;
                            case 'between': 
                                if (!val2 || isNaN(val2)) return false;
                                val2.setHours(23,59,59,999);
                                return testDate >= val1 && testDate <= val2;
                            default: return true;
                        }
                    });
                }
            }

            dailyList.sort((a,b) => {
                if(!a.date || !b.date) return 0;
                return new Date(b.date) - new Date(a.date); // newest first
            });

            const options = `<option value="">Select a Daily Test...</option>` + 
                dailyList.map(a => `<option value="${a.code}">${a.code} ${a.date ? '(' + formatChartDate(a.date) + ')' : ''}</option>`).join('');
            if (dSelect) dSelect.innerHTML = options;
        };

        if (dailyDateFilter) {
            dailyDateFilter.removeEventListener('change', updateDailyTestsOptions);
            dailyDateFilter.addEventListener('change', updateDailyTestsOptions);
            if (d1) d1.addEventListener('input', updateDailyTestsOptions);
            if (d2) d2.addEventListener('input', updateDailyTestsOptions);
        }
        updateDailyTestsOptions();

        // Extract TD
        const tdTests = [...new Set(centreSchedules.filter(s => (s.type || '').toLowerCase().includes('t&d')).map(s => s.topic).filter(Boolean))].sort();
        // Extract GT
        const gtTests = [...new Set(centreSchedules.map(s => s.marrow_gt).filter(c => c && c.trim() !== '-' && c.trim() !== ''))].sort();

        const buildOptions = (arr, label) => `<option value="">Select a ${label}...</option>` + arr.map(a => `<option value="${a}">${a}</option>`).join('');
        
        if (tdSelect) tdSelect.innerHTML = buildOptions(tdTests, 'T&D Test');
        if (gtSelect) gtSelect.innerHTML = buildOptions(gtTests, 'Marrow GT');

        // To avoid duplicate bindings if fetchGlobalData runs multiple times
        if(!dSelect.hasAttribute('data-bound')) {
            dSelect.addEventListener('change', (e) => renderDaily(e.target.value));
            tdSelect.addEventListener('change', (e) => renderRankingTable(e.target.value, 'td'));
            gtSelect.addEventListener('change', (e) => renderRankingTable(e.target.value, 'gt'));
            dSelect.setAttribute('data-bound', 'true');
        }
    };

    const getMatchingResults = (code, type) => {
        const cleanCode = (code || '').trim().toLowerCase();

        // Find which students appeared. We cross map centerStudents array with centreResults.
        return centreStudents.map(student => {
            const studentEmail = (student.email_id || '').trim().toLowerCase();
            const studentEnrolment = (student.enrolment_id || '').trim().toLowerCase();

            const result = centreResults.find(r => {
                const rEmail = (r.user_email || '').trim().toLowerCase();
                const rEnrolment = (r.enrolment_id || '').trim().toLowerCase();
                
                const isUserMatch = (studentEnrolment && rEnrolment === studentEnrolment) || (studentEmail && rEmail === studentEmail);
                if (!isUserMatch) return false;

                const rModCode = (r.custom_module_code || '').trim().toLowerCase();
                const rTestName = (r.test_name || '').trim().toLowerCase();
                const rType = (r.test_type || '').trim().toLowerCase();

                if (type === 'daily') {
                    return rModCode === cleanCode || rTestName === cleanCode;
                } else if (type === 'td') {
                    return (rType.includes('t&d') || rType === 'test & discussion') && (rModCode === cleanCode || rTestName === cleanCode);
                } else if (type === 'gt') {
                    return rType.includes('marrow gt') && (rModCode === cleanCode || rTestName === cleanCode);
                }
                return false;
            });

            let score = '-';
            let percentile = '-';
            let status = 'Absent';

            if (result && (result.score || result.percentile)) {
                status = 'Present';
                score = result.score || '-';
                percentile = result.percentile ? parseFloat(String(result.percentile).replace(/[^\d.-]/g, '')) : '-';
            }

            return {
                ...student,
                status,
                score,
                percentile: percentile !== '-' ? percentile : 0, 
                percentileDisplay: percentile !== '-' ? percentile + '%' : '-'
            };
        });
    };

    const renderDaily = (code) => {
        const tbody = document.getElementById('daily-tbody');
        if (!code) { tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;">Select a test to view students</td></tr>`; return; }

        const rows = getMatchingResults(code, 'daily');
        
        let presentCount = 0;
        let totalScore = 0;

        rows.forEach(r => {
            if (r.status === 'Present') {
                presentCount++;
                totalScore += parseFloat(r.score) || 0;
            }
        });

        const absentCount = rows.length - presentCount;
        const avgScore = presentCount > 0 ? (totalScore / presentCount).toFixed(1) : '-';
        const passPercent = rows.length > 0 ? Math.round((presentCount / rows.length) * 100) + '%' : '0%';

        document.getElementById('daily-present').textContent = presentCount;
        document.getElementById('daily-absent').textContent = absentCount;
        document.getElementById('daily-avg-score').textContent = avgScore;
        document.getElementById('daily-pass').textContent = passPercent;

        const renderTableOnly = () => {
            const filterVal = document.getElementById('daily-table-filter').value;
            
            let tableRows = [...rows];
            if (filterVal === 'present') tableRows = tableRows.filter(r => r.status === 'Present');
            else if (filterVal === 'absent') tableRows = tableRows.filter(r => r.status === 'Absent');

            tableRows.sort((a,b) => {
                const col = currentSort.daily.col;
                const asc = currentSort.daily.asc;
                let aVal = a[col];
                let bVal = b[col];
                
                if (col === 'score' || col === 'percentile') {
                    aVal = parseFloat(aVal) || 0;
                    bVal = parseFloat(bVal) || 0;
                    return asc ? aVal - bVal : bVal - aVal;
                } else {
                    aVal = String(aVal || '').toLowerCase();
                    bVal = String(bVal || '').toLowerCase();
                    return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
            });

            const headers = document.querySelectorAll('#tab-daily th[data-sort]');
            headers.forEach(h => {
                const icon = h.querySelector('.sort-icon');
                if (icon) icon.textContent = '';
                if (h.dataset.sort === currentSort.daily.col && icon) {
                    icon.textContent = currentSort.daily.asc ? '↑' : '↓';
                }
            });

            if(tableRows.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;">No students matched the filter</td></tr>`;
                return;
            }

            tbody.innerHTML = tableRows.map(r => `
                <tr>
                    <td>${r.enrolment_id}</td>
                    <td style="font-weight: 500;">${r.name}</td>
                    <td style="text-align: center;"><span class="status-pill status-${r.status.toLowerCase()}">${r.status}</span></td>
                    <td style="text-align: center; font-weight: 600;">${r.score}</td>
                    <td style="text-align: center;">${r.percentileDisplay}</td>
                </tr>
            `).join('');
        };

        renderTableOnly();

        const filterEl = document.getElementById('daily-table-filter');
        if(filterEl) filterEl.onchange = renderTableOnly;

        window.renderDailyTableOnly = renderTableOnly;
    };

    const renderRankingTable = (code, type) => {
        const tbody = document.getElementById(`${type}-tbody`);
        const leaderboard = document.getElementById(`${type}-leaderboard`);
        if (!code) { 
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;">Select a test to view students</td></tr>`;
            leaderboard.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 1rem;">Select a test to view top performers</div>`;
            return; 
        }

        const rows = getMatchingResults(code, type);
        let presentCount = 0;
        let totalPercentile = 0;

        rows.forEach(r => {
            if (r.status === 'Present') {
                presentCount++;
                totalPercentile += parseFloat(r.percentile) || 0;
            }
        });

        document.getElementById(`${type}-present`).textContent = presentCount;
        document.getElementById(`${type}-absent`).textContent = rows.length - presentCount;
        document.getElementById(`${type}-avg-percentile`).textContent = presentCount > 0 ? (totalPercentile / presentCount).toFixed(1) + '%' : '-';

        // Sort descending by percentile
        const sortedRows = [...rows].sort((a, b) => b.percentile - a.percentile);

        // Leaderboard Top 10 Only
        const top10 = sortedRows.filter(r => r.status === 'Present').slice(0, 10);
        
        if (top10.length === 0) {
            leaderboard.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 1rem;">No participants found for this test</div>`;
        } else {
            leaderboard.innerHTML = top10.map((r, idx) => {
                let badgeClass = `rank-${Math.min(idx + 1, 4)}`; // 1, 2, 3, or fallback
                if(idx > 2) badgeClass = '';
                return `
                    <div class="leaderboard-item">
                        <div class="rank-badge ${badgeClass}">${idx + 1}</div>
                        <div class="student-info">
                            <div class="student-name">${r.name}</div>
                            <div class="student-id">${r.enrolment_id}</div>
                        </div>
                        <div class="student-score">${r.percentileDisplay}</div>
                    </div>
                `;
            }).join('');
        }

        const renderTableOnly = () => {
            const filterVal = document.getElementById(`${type}-table-filter`).value;

            let tableRows = [...rows];
            if (filterVal === 'present') tableRows = tableRows.filter(r => r.status === 'Present');
            else if (filterVal === 'absent') tableRows = tableRows.filter(r => r.status === 'Absent');

            tableRows.sort((a,b) => {
                const col = currentSort[type].col;
                const asc = currentSort[type].asc;
                let aVal = a[col];
                let bVal = b[col];
                
                if (col === 'score' || col === 'percentile') {
                    aVal = parseFloat(aVal) || 0;
                    bVal = parseFloat(bVal) || 0;
                    return asc ? aVal - bVal : bVal - aVal;
                } else {
                    aVal = String(aVal || '').toLowerCase();
                    bVal = String(bVal || '').toLowerCase();
                    return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
            });

            const headers = document.querySelectorAll(`#tab-${type} th[data-sort]`);
            headers.forEach(h => {
                const icon = h.querySelector('.sort-icon');
                if (icon) icon.textContent = '';
                if (h.dataset.sort === currentSort[type].col && icon) {
                    icon.textContent = currentSort[type].asc ? '↑' : '↓';
                }
            });

            if(tableRows.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;">No students matched the filter</td></tr>`;
                return;
            }

            tbody.innerHTML = tableRows.map(r => `
                <tr>
                    <td>${r.enrolment_id}</td>
                    <td style="font-weight: 500;">${r.name}</td>
                    <td style="text-align: center;"><span class="status-pill status-${r.status.toLowerCase()}">${r.status}</span></td>
                    <td style="text-align: center;">${r.score}</td>
                    <td style="text-align: center; font-weight: 700;">${r.percentileDisplay}</td>
                </tr>
            `).join('');
        };

        renderTableOnly();

        const filterEl = document.getElementById(`${type}-table-filter`);
        if(filterEl) filterEl.onchange = renderTableOnly;

        if (type === 'td') window.renderTdTableOnly = renderTableOnly;
        if (type === 'gt') window.renderGtTableOnly = renderTableOnly;
    };

    document.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-sort]');
        if (!th) return;

        const tabDiv = th.closest('.analytics-content');
        if (!tabDiv) return;

        const tabId = tabDiv.id;
        let type;
        if (tabId === 'tab-daily') type = 'daily';
        else if (tabId === 'tab-td') type = 'td';
        else if (tabId === 'tab-gt') type = 'gt';
        if (!type) return;

        const col = th.dataset.sort;
        if (currentSort[type].col === col) {
            currentSort[type].asc = !currentSort[type].asc;
        } else {
            currentSort[type].col = col;
            currentSort[type].asc = true;
        }

        if (type === 'daily' && window.renderDailyTableOnly) window.renderDailyTableOnly();
        if (type === 'td' && window.renderTdTableOnly) window.renderTdTableOnly();
        if (type === 'gt' && window.renderGtTableOnly) window.renderGtTableOnly();
    });

    init();
});
