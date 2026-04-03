document.addEventListener('DOMContentLoaded', async () => {
    const client = window.supabaseClient;
    if (!client) return;
    
    let currentUser = null;
    let centreStudents = [];
    let centreSchedules = [];
    let centreResults = [];
    
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

        const profileBtn = document.getElementById('user-profile-btn');
        profileBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            profileBtn.classList.toggle('active');
        });
        document.addEventListener('click', () => profileBtn?.classList.remove('active'));

        const sidebar = document.querySelector('.sidebar');
        const sidebarToggle = document.getElementById('sidebar-toggle-btn');
        sidebarToggle?.addEventListener('click', () => sidebar?.classList.toggle('collapsed'));

        let queryCentre = currentUser.centre_name;
        if (currentUser.role === 'Super admin' || currentUser.role === 'Admin') {
            const ctFilterContainer = document.getElementById('admin-centre-filter-container');
            if (ctFilterContainer) ctFilterContainer.style.display = 'flex';
            
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
            let resData = [];
            let rFrom = 0;
            const rStep = 4000;
            while (true) {
                const { data, error } = await client.from('Test_Results').select('*').range(rFrom, rFrom + rStep - 1);
                if (error) throw error;
                if (!data || data.length === 0) break;
                resData = resData.concat(data);
                if (data.length < rStep) break;
                rFrom += rStep;
            }
            centreResults = resData;

            renderTables();
        } catch (e) {
            console.error(e);
            const b = document.getElementById('daily-tbody');
            if(b) b.insertAdjacentHTML('afterbegin', `<div style="color:red; padding:1rem; position:absolute; left:0; right:0; text-align:center;">Fatal Crash: ${e.message || e}</div>`);
        }
    };

    const getMatchingResults = (code, type) => {
        const cleanCode = (code || '').trim().toLowerCase();

        const relevantResults = centreResults.filter(r => {
            const rModCode = (r.custom_module_code || '').trim().toLowerCase();
            const rTestName = (r.test_name || '').trim().toLowerCase();
            const rType = (r.test_type || '').trim().toLowerCase();
            if (type === 'daily') return rModCode === cleanCode || rTestName === cleanCode;
            if (type === 'td') return (rType.includes('t&d') || rType === 'test & discussion') && (rModCode === cleanCode || rTestName === cleanCode);
            if (type === 'gt') return rType.includes('marrow gt') && (rModCode === cleanCode || rTestName === cleanCode);
            return false;
        });

        const resultMap = {};
        for (let r of relevantResults) {
            const rEmail = (r.user_email || '').trim().toLowerCase();
            const rEnrolment = (r.enrolment_id || '').trim().toLowerCase();
            if (rEmail) resultMap[rEmail] = r;
            if (rEnrolment) resultMap[rEnrolment] = r;
        }

        return centreStudents.map(student => {
            const studentEmail = (student.email_id || '').trim().toLowerCase();
            const studentEnrolment = (student.enrolment_id || '').trim().toLowerCase();

            const result = resultMap[studentEnrolment] || resultMap[studentEmail] || null;

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
                percentile: percentile !== '-' ? percentile : 0
            };
        });
    };

    const calculateMetrics = (testName, type) => {
        const rows = getMatchingResults(testName, type);
        let present = 0;
        let totalScore = 0;
        let passCount = 0;
        let totalPercentile = 0;

        rows.forEach(r => {
            if (r.status === 'Present') {
                present++;
                totalScore += parseFloat(r.score) || 0;
                totalPercentile += parseFloat(r.percentile) || 0;
                
                if (type === 'daily') {
                    const percentageScore = parseFloat(r.percentile); // Custom Module percentile column stores %
                    if (!isNaN(percentageScore) && percentageScore >= 50) {
                        passCount++;
                    }
                }
            }
        });

        const absent = rows.length - present;
        const avgScore = present > 0 ? (totalScore / present).toFixed(1) : '-';
        const avgPercentile = present > 0 ? (totalPercentile / present).toFixed(1) + '%' : '-';
        const passPercent = present > 0 ? Math.round((passCount / present) * 100) + '%' : '-';

        return { present, absent, avgScore, avgPercentile, passPercent };
    };

    let cachedData = { daily: [], td: [], gt: [] };
    let tableStates = {
        daily: { sortCol: 'date', sortDir: -1, dateFilter: 'all', d1: '', d2: '', q: '', textQ: '' },
        td: { sortCol: 'date', sortDir: -1, dateFilter: 'all', d1: '', d2: '', q: '' },
        gt: { sortCol: 'date', sortDir: -1, dateFilter: 'all', d1: '', d2: '', q: '' }
    };

    const applyDateFilterState = (tab, dt) => {
        if (!dt) return false;
        const testDate = new Date(dt);
        testDate.setHours(0,0,0,0);
        const { dateFilter, d1, d2 } = tableStates[tab];
        if (dateFilter === 'all') return true;
        const val1 = d1 ? new Date(d1) : null;
        const val2 = d2 ? new Date(d2) : null;
        if (val1) val1.setHours(0,0,0,0);

        switch(dateFilter) {
            case 'on': return val1 && testDate.getTime() === val1.getTime();
            case 'before': return val1 && testDate < val1;
            case 'after': return val1 && testDate > val1;
            case 'since': return val1 && testDate >= val1;
            case 'between': 
                if (!val1 || !val2 || isNaN(val2.getTime())) return false;
                val2.setHours(23,59,59,999);
                return testDate >= val1 && testDate <= val2;
            default: return true;
        }
    };

    const precalculateMetrics = () => {
        const codeMapDaily = {};
        const codeMapTD = {};
        const codeMapGT = {};

        centreSchedules.forEach(s => {
            const code = s.custom_module_code;
            const tdName = s.topic;
            const gtName = s.marrow_gt;
            const sType = (s.type || '').toLowerCase();
            const subjectName = s.subject || '-';

            if (sType.includes('t&d') || sType.includes('test & discussion')) {
                if (tdName && tdName.trim() !== '-') {
                    if (!codeMapTD[tdName] || (codeMapTD[tdName].date < s.date)) codeMapTD[tdName] = { name: tdName, date: s.date };
                }
            }
            if (gtName && gtName.trim() !== '-') {
                if (!codeMapGT[gtName] || (codeMapGT[gtName].date < s.date)) codeMapGT[gtName] = { name: gtName, date: s.date };
            } 
            if (code && code.trim() !== '-') {
                if (!codeMapDaily[code] || (codeMapDaily[code].date < s.date)) codeMapDaily[code] = { name: code, subject: subjectName, date: s.date };
            }
        });

        cachedData.daily = Object.values(codeMapDaily).map(t => ({...t, ...calculateMetrics(t.name, 'daily')}));
        cachedData.td = Object.values(codeMapTD).map(t => ({...t, ...calculateMetrics(t.name, 'td')}));
        cachedData.gt = Object.values(codeMapGT).map(t => ({...t, ...calculateMetrics(t.name, 'gt')}));

        // Populate Daily Subjects filter
        const dSubjSelect = document.getElementById('daily-subject-filter');
        if (dSubjSelect) {
            const subjects = [...new Set(cachedData.daily.map(d => d.subject).filter(s => s && s !== '-'))].sort();
            dSubjSelect.innerHTML = `<option value="all">All Subjects</option>` + subjects.map(s => `<option value="${s}">${s}</option>`).join('');
            if (tableStates.daily.q && subjects.includes(tableStates.daily.q)) {
                dSubjSelect.value = tableStates.daily.q;
            } else {
                tableStates.daily.q = 'all';
            }
        }
    };

    const processAndRenderTable = (tab) => {
        const state = tableStates[tab];
        let list = [...cachedData[tab]];
        if (state.dateFilter !== 'all') {
            list = list.filter(t => applyDateFilterState(tab, t.date));
        }

        if (tab === 'daily') {
            if (state.q && state.q !== 'all') {
                list = list.filter(t => t.subject === state.q);
            }
            if (state.textQ) {
                const query = state.textQ.toLowerCase();
                list = list.filter(t => t.name.toLowerCase().includes(query));
            }
        } else if (state.q) {
            const query = state.q.toLowerCase();
            list = list.filter(t => t.name.toLowerCase().includes(query));
        }

        list.sort((a, b) => {
            let valA, valB;
            switch(state.sortCol) {
                case 'date': 
                    valA = new Date(a.date || 0).getTime();
                    valB = new Date(b.date || 0).getTime();
                    break;
                case 'subject':
                    valA = (a.subject || '').toLowerCase();
                    valB = (b.subject || '').toLowerCase();
                    break;
                case 'name':
                    valA = a.name.toLowerCase();
                    valB = b.name.toLowerCase();
                    break;
                case 'present': valA = a.present; valB = b.present; break;
                case 'absent': valA = a.absent; valB = b.absent; break;
                case 'score':
                    valA = a.avgScore === '-' ? -1 : parseFloat(a.avgScore);
                    valB = b.avgScore === '-' ? -1 : parseFloat(b.avgScore);
                    break;
                case 'pass':
                case 'percentile':
                    let attrA = tab === 'daily' ? a.passPercent : a.avgPercentile;
                    let attrB = tab === 'daily' ? b.passPercent : b.avgPercentile;
                    valA = attrA === '-' ? -1 : parseFloat(String(attrA).replace('%',''));
                    valB = attrB === '-' ? -1 : parseFloat(String(attrB).replace('%',''));
                    break;
                default: return 0;
            }
            if (valA < valB) return -1 * state.sortDir;
            if (valA > valB) return 1 * state.sortDir;
            return 0;
        });

        const tbody = document.getElementById(`${tab}-tbody`);
        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;">No tests found matching criteria</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(t => {
            let metricCol = tab === 'daily' ? 
                `<td style="text-align: center; color: #22c55e; font-weight: 600;">${t.passPercent}</td>` :
                `<td style="text-align: center; color: var(--accent-color); font-weight: 600;">${t.avgPercentile}</td>`;
            let subjCol = tab === 'daily' ? `<td>${t.subject || '-'}</td>` : '';
            return `
                <tr>
                    <td style="color: var(--text-secondary);">${formatChartDate(t.date)}</td>
                    ${subjCol}
                    <td style="font-weight: 500;">${t.name}</td>
                    <td style="text-align: center; color: #38bdf8; font-weight: 600;">${t.present}</td>
                    <td style="text-align: center; color: var(--text-secondary); font-weight: 600;">${t.absent}</td>
                    <td style="text-align: center; font-weight: 600;">${t.avgScore}</td>
                    ${metricCol}
                </tr>
            `;
        }).join('');
    };

    const renderTables = () => {
        precalculateMetrics();
        processAndRenderTable('daily');
        processAndRenderTable('td');
        processAndRenderTable('gt');
    };

    const setupListeners = () => {
        ['daily', 'td'].forEach(tab => {
            const dateSel = document.getElementById(`${tab}-date-filter`);
            const divInp = document.getElementById(`${tab}-date-inputs`);
            const d1 = document.getElementById(`${tab}-date-1`);
            const sep = document.getElementById(`${tab}-date-separator`);
            const d2 = document.getElementById(`${tab}-date-2`);
            const subj = document.getElementById(`${tab}-subject-filter`);

            const updateFilterUI = () => {
                const f = dateSel.value;
                tableStates[tab].dateFilter = f;
                if(f === 'all') {
                    divInp.style.display = 'none';
                } else {
                    divInp.style.display = 'flex';
                    if(f === 'between') {
                        sep.style.display = 'block'; d2.style.display = 'block';
                    } else {
                        sep.style.display = 'none'; d2.style.display = 'none';
                    }
                }
                processAndRenderTable(tab);
            };

            dateSel?.addEventListener('change', updateFilterUI);
            d1?.addEventListener('input', (e) => { tableStates[tab].d1 = e.target.value; processAndRenderTable(tab); });
            d2?.addEventListener('input', (e) => { tableStates[tab].d2 = e.target.value; processAndRenderTable(tab); });
            
            if (tab === 'daily') {
                const textInput = document.getElementById('daily-text-filter');
                subj?.addEventListener('change', (e) => { tableStates[tab].q = e.target.value; processAndRenderTable(tab); });
                textInput?.addEventListener('input', (e) => { tableStates[tab].textQ = e.target.value; processAndRenderTable(tab); });
            } else {
                subj?.addEventListener('input', (e) => { tableStates[tab].q = e.target.value; processAndRenderTable(tab); });
            }
        });

        ['daily', 'td', 'gt'].forEach(tab => {
            const container = document.getElementById(`tab-${tab}`);
            container?.querySelectorAll('th[data-sort]').forEach(th => {
                const icon = th.querySelector('.sort-icon');
                if (tableStates[tab].sortCol === th.dataset.sort) {
                    icon.innerHTML = '&#8595;';
                }
            
                th.addEventListener('click', () => {
                    const col = th.dataset.sort;
                    if(tableStates[tab].sortCol === col) {
                        tableStates[tab].sortDir *= -1;
                    } else {
                        tableStates[tab].sortCol = col;
                        tableStates[tab].sortDir = -1;
                    }
                    container.querySelectorAll('.sort-icon').forEach(ic => ic.innerHTML = '');
                    const ic = th.querySelector('.sort-icon');
                    if(ic) ic.innerHTML = tableStates[tab].sortDir === 1 ? '&#8593;' : '&#8595;';
                    processAndRenderTable(tab);
                });
            });
        });
    };

    setupListeners();

    init();
});
