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

    // Filter Elements
    const topicSearch = document.getElementById('topic-search');
    const typeFilter = document.getElementById('type-filter');
    const dateFilter = document.getElementById('date-filter');
    const clearBtn = document.getElementById('clear-perf-filters');

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

            allSchedules = schedules || [];
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

        const topicTerm = topicSearch.value.toLowerCase().trim();
        const typeTerm = typeFilter.value;
        const dateTerm = dateFilter.value;

        // 1. Marrow GT Window Logic & Type Override
        filtered = filtered.map(s => {
            const item = { ...s };
            // If it has a marrow_gt window, and it's a GT Day
            // User: "Marrow GT 14 window is from 8th March to 13th March. So, the Marrow GT 14 to be listed on date 13th March with a Type as Marrow GT."
            if (item.type === 'GT Day' && item.marrow_gt && item.marrow_gt !== '-') {
                item.displayType = 'Marrow GT';
            } else {
                item.displayType = item.type || 'Study Day';
            }
            return item;
        });

        // 2. Filter by Search
        if (topicTerm) {
            filtered = filtered.filter(s => (s.topic || '').toLowerCase().includes(topicTerm));
        }

        // 3. Filter by Type
        if (typeTerm !== 'all') {
            filtered = filtered.filter(s => s.displayType === typeTerm);
        }

        // 4. Filter by Date
        if (dateTerm) {
            filtered = filtered.filter(s => s.date === dateTerm);
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
            const result = (s.custom_module_code && currentResultsMap[s.custom_module_code]) || { score: '-', percentile: '-' };

            let typeClass = 'badge-study';
            if (s.displayType === 'Marrow GT') typeClass = 'badge-gt';
            else if (s.displayType === 'GT Day') typeClass = 'badge-gt';
            else if (s.displayType === 'T&D Day') typeClass = 'badge-td';

            const displayModule = (s.displayType === 'T&D Day' || s.displayType === 'GT Day' || s.displayType === 'Marrow GT') ? '-' : (s.custom_module_code || '-');

            const displayTopic = (s.displayType === 'Marrow GT' && s.marrow_gt && s.marrow_gt !== '-')
                ? `${s.topic} <br><small style="color:var(--text-secondary)">Window: ${s.marrow_gt}</small>`
                : (s.topic || '-');

            return `
                <tr>
                    <td style="color: var(--text-secondary); font-size: 0.85rem;">${formatDate(s.date)}</td>
                    <td><span class="type-badge ${typeClass}">${s.displayType}</span></td>
                    <td style="font-weight: 600;">${displayTopic}</td>
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

        // Today's date in YYYY-MM-DD
        const todayStr = new Date().toISOString().split('T')[0];

        // Total tests listed up to today
        // A "test" is any entry that is T&D, GT, or has a custom module code
        const potentialTests = schedules.filter(s => {
            const isTestType = (s.type === 'T&D Day' || s.type === 'GT Day' || (s.custom_module_code && s.custom_module_code !== '-'));
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
    topicSearch?.addEventListener('input', applyFilters);
    typeFilter?.addEventListener('change', applyFilters);
    dateFilter?.addEventListener('change', applyFilters);
    clearBtn?.addEventListener('click', () => {
        topicSearch.value = '';
        typeFilter.value = 'all';
        dateFilter.value = '';
        applyFilters();
    });

    fetchPerformance();
});
