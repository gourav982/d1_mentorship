document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth & Profile
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }

    const { data: userData } = await supabaseClient
        .from('Access')
        .select('*')
        .ilike('email_id', session.user.email)
        .single();

    if (!userData) {
        window.location.replace('index.html');
        return;
    }

    // UI Init
    document.getElementById('display-name').textContent = userData.name || 'User';
    document.getElementById('display-role').textContent = userData.role;
    document.getElementById('avatar-circle').textContent = (userData.name || 'U').charAt(0).toUpperCase();

    // Sidebar & Admin
    const adminRoles = ['Super admin', 'Admin', 'Mentor', 'Academics'];
    const adminSec = document.getElementById('admin-section');
    if (adminSec && adminRoles.includes(userData.role)) {
        adminSec.style.display = 'block';
    }

    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    toggleBtn?.addEventListener('click', () => {
        sidebar?.classList.toggle('collapsed');
    });

    // UI State for Performance
    let allSchedules = [];
    let currentResultsMap = {};

    // UI Elements for Filtering
    const dateCondition = document.getElementById('date-condition');
    const dateVal1 = document.getElementById('date-val-1');
    const dateVal2 = document.getElementById('date-val-2');
    const typeFilter = document.getElementById('type-filter');
    const topicSearch = document.getElementById('topic-search');
    const clearBtn = document.getElementById('clear-perf-filters');

    // Show/Hide date inputs
    dateCondition?.addEventListener('change', () => {
        const cond = dateCondition.value;
        dateVal1.style.display = cond === 'all' ? 'none' : 'block';
        dateVal2.style.display = cond === 'between' ? 'block' : 'none';
        applyFilters();
    });

    // 2. Data Fetching
    const fetchPerformance = async () => {
        try {
            // Get schedules for user's centre
            const { data: schedules } = await supabaseClient
                .from('Schedule')
                .select('*')
                .eq('centre_name', userData.centre_name || 'Delhi')
                .order('date', { ascending: true }); // MANDATORY SEQUENCE

            // Get test results for user's email
            const { data: results } = await supabaseClient
                .from('Test_Results')
                .select('*')
                .eq('user_email', session.user.email);

            const rawSchedules = schedules || [];

            // Process to add Marrow GT Virtual Rows
            // 1. Map each schedule to displayType = original type
            let processed = rawSchedules.map(s => ({ ...s, displayType: s.type || 'Study Day' }));

            // 2. Group by Marrow GT window name to find the "Last Date"
            const marrowWindows = {}; // { 'NEET PG Marrow GT 14': '2026-03-13' }
            rawSchedules.forEach(s => {
                if (s.marrow_gt && s.marrow_gt !== '-') {
                    const name = s.marrow_gt.trim();
                    if (!marrowWindows[name] || s.date > marrowWindows[name]) {
                        marrowWindows[name] = s.date;
                    }
                }
            });

            // 3. Inject virtual rows for the last day of each window
            const finalProcessed = [];
            processed.forEach(s => {
                finalProcessed.push(s);

                // If this is the last day of a marrow window, inject the GT entry
                if (s.marrow_gt && s.marrow_gt !== '-' && s.date === marrowWindows[s.marrow_gt.trim()]) {
                    // Check if we haven't already injected for this specific window date
                    // (prevents double injection if multiple rows exist for the same last date)
                    const alreadyInjected = finalProcessed.some(prev =>
                        prev.isVirtual &&
                        prev.date === s.date &&
                        prev.topic === s.marrow_gt.trim()
                    );

                    if (!alreadyInjected) {
                        finalProcessed.push({
                            id: `virtual-${s.marrow_gt.trim()}-${s.date}`,
                            date: s.date,
                            displayType: 'Marrow GT',
                            topic: s.marrow_gt.trim(),
                            marrow_gt: s.marrow_gt,
                            custom_module_code: s.marrow_gt.trim(), // Map to result via its name
                            isVirtual: true,
                            num_questions: null
                        });
                    }
                }
            });

            allSchedules = finalProcessed;
            currentResultsMap = {};
            results?.forEach(r => currentResultsMap[r.custom_module_code] = r);

            applyFilters();
        } catch (err) {
            console.error(err);
            document.getElementById('performance-body').innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ef4444; padding:2rem;">Error loading data</td></tr>`;
        }
    };

    const applyFilters = () => {
        let filtered = [...allSchedules];

        // 1. Date Filter
        const cond = dateCondition.value;
        const v1 = dateVal1.value;
        const v2 = dateVal2.value;

        if (cond !== 'all' && v1) {
            filtered = filtered.filter(item => {
                const itemDate = item.date;
                if (cond === 'on') return itemDate === v1;
                if (cond === 'before') return itemDate < v1;
                if (cond === 'after') return itemDate > v1;
                if (cond === 'since') return itemDate >= v1;
                if (cond === 'between' && v2) return itemDate >= v1 && itemDate <= v2;
                return true;
            });
        }

        // 2. Type Filter
        const typeTerm = typeFilter.value;
        if (typeTerm !== 'all') {
            filtered = filtered.filter(item => item.displayType === typeTerm);
        }

        // 3. Topic Search
        const search = topicSearch.value.toLowerCase().trim();
        if (search) {
            filtered = filtered.filter(item =>
                (item.topic || '').toLowerCase().includes(search) ||
                (item.subject || '').toLowerCase().includes(search) ||
                (item.marrow_gt || '').toLowerCase().includes(search)
            );
        }

        renderPerformance(filtered);
        renderStats(allSchedules, currentResultsMap);
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const renderPerformance = (schedules) => {
        const body = document.getElementById('performance-body');

        if (!schedules || schedules.length === 0) {
            body.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-secondary);">No roadmap data found matching filters.</td></tr>';
            return;
        }

        body.innerHTML = schedules.map(s => {
            // Virtual Marrow GT results are usually mapped by the GT Name in 'custom_module_code'
            const result = (s.custom_module_code && currentResultsMap[s.custom_module_code]) || { score: '-', percentile: '-' };

            let typeClass = 'badge-study';
            if (s.displayType === 'Marrow GT') typeClass = 'badge-gt';
            else if (s.displayType === 'GT Day') typeClass = 'badge-gt';
            else if (s.displayType === 'T&D Day') typeClass = 'badge-td';

            // Hide module code text for Tests (except Study Days)
            const displayModule = (s.displayType === 'T&D Day' || s.displayType === 'GT Day' || s.displayType === 'Marrow GT') ? '-' : (s.custom_module_code || '-');

            const isVirtualGT = s.displayType === 'Marrow GT';
            const displayTopic = isVirtualGT
                ? `<span style="color: var(--accent-color); font-weight: 700;">${s.topic}</span>`
                : (s.topic || '-');

            // Sub-info for regular days within a window
            const subInfo = (!isVirtualGT && s.marrow_gt && s.marrow_gt !== '-')
                ? `<br><small style="color:var(--text-secondary)">Window: ${s.marrow_gt}</small>`
                : '';

            return `
                <tr class="${isVirtualGT ? 'virtual-test-row' : ''}">
                    <td style="color: var(--text-secondary); font-size: 0.85rem;">${formatDate(s.date)}</td>
                    <td><span class="type-badge ${typeClass}">${s.displayType}</span></td>
                    <td style="font-weight: 600;">${displayTopic}${subInfo}</td>
                    <td>${displayModule}</td>
                    <td style="text-align: center; color: var(--text-secondary);">${s.num_questions || '-'}</td>
                    <td class="score-val" style="text-align: center;">${result.score}</td>
                    <td class="percentile-val" style="text-align: center;">${result.percentile}</td>
                </tr>
            `;
        }).join('');
    };

    const renderStats = (schedules, resultsMap) => {
        const container = document.getElementById('stats-summary');
        const todayStr = new Date().toISOString().split('T')[0];

        // Total tests listed up to today
        // A "test" is any entry that is T&D, GT, Marrow GT, or has a custom module code
        const potentialTests = schedules.filter(s => {
            const isTestType = (s.displayType === 'T&D Day' || s.displayType === 'GT Day' || s.displayType === 'Marrow GT' || (s.custom_module_code && s.custom_module_code !== '-'));
            return isTestType && s.date <= todayStr;
        });

        // Count of tests where there is an actual score/percentile
        const testsWithData = potentialTests.filter(s => {
            const res = s.custom_module_code && resultsMap[s.custom_module_code];
            return res && res.score !== '-' && res.score !== null;
        }).length;

        const totalPool = potentialTests.length;

        container.innerHTML = `
            <div class="stat-card" style="max-width: 400px; margin: 0 auto;">
                <div class="stat-value">${testsWithData} / ${totalPool}</div>
                <div class="stat-label">Tests Completed (As of Today)</div>
            </div>
        `;
    };

    // Event Listeners
    [dateVal1, dateVal2, typeFilter].forEach(el => el?.addEventListener('change', applyFilters));
    topicSearch?.addEventListener('input', applyFilters);

    clearBtn?.addEventListener('click', () => {
        dateCondition.value = 'all';
        dateVal1.value = '';
        dateVal2.value = '';
        dateVal1.style.display = 'none';
        dateVal2.style.display = 'none';
        typeFilter.value = 'all';
        topicSearch.value = '';
        applyFilters();
    });

    fetchPerformance();
});
