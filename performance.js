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

    // 2. Data Fetching
    const fetchPerformance = async () => {
        try {
            // Get schedules for user's centre
            const { data: schedules } = await supabaseClient
                .from('Schedule')
                .select('*')
                .eq('centre_name', userData.centre_name || 'Delhi')
                .order('date', { ascending: false });

            // Get test results for user's email
            const { data: results } = await supabaseClient
                .from('Test_Results')
                .select('*')
                .eq('user_email', session.user.email);

            const resultRows = schedules || [];
            const resultsMap = {};
            results?.forEach(r => resultsMap[r.custom_module_code] = r);

            renderPerformance(resultRows, resultsMap);
            renderStats(resultRows, resultsMap);
        } catch (err) {
            console.error(err);
            document.getElementById('performance-body').innerHTML = `<tr><td colspan="7" style="text-align:center; color:#ef4444; padding:2rem;">Error loading data</td></tr>`;
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const renderPerformance = (schedules, resultsMap) => {
        const body = document.getElementById('performance-body');

        // Filter: Show only if it's a test-related day or has a module code
        // User wants: "Study Day" (if score exists), "T&D", "GT"
        const filtered = schedules.filter(s => {
            const hasScore = s.custom_module_code && resultsMap[s.custom_module_code];
            const isTestDay = s.type === 'T&D Day' || s.type === 'GT Day';
            return hasScore || isTestDay;
        });

        if (filtered.length === 0) {
            body.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-secondary);">No performance records found yet. Keep studying!</td></tr>';
            return;
        }

        body.innerHTML = filtered.map(s => {
            const result = (s.custom_module_code && resultsMap[s.custom_module_code]) || { score: '-', percentile: '-' };
            const typeClass = s.type === 'GT Day' ? 'badge-gt' : (s.type === 'T&D Day' ? 'badge-td' : 'badge-study');

            // For T&D and GT, module code stays empty as per user request
            const displayModule = (s.type === 'T&D Day' || s.type === 'GT Day') ? '-' : (s.custom_module_code || '-');

            // For GT, user mentioned "last date for that specific Marrow GT"
            // If the schedule provides a range or if marrow_gt has info, we could show it.
            // For now, use the date column.

            return `
                <tr>
                    <td style="color: var(--text-secondary); font-size: 0.85rem;">${formatDate(s.date)}</td>
                    <td><span class="type-badge ${typeClass}">${s.type || 'Study Day'}</span></td>
                    <td style="font-weight: 600;">${s.topic || '-'}</td>
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

        const testCount = schedules.filter(s => s.custom_module_code && resultsMap[s.custom_module_code]).length;
        const avgScore = 0; // Placeholder

        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${testCount}</div>
                <div class="stat-label">Tests Completed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">Coming Soon</div>
                <div class="stat-label">Average Accuracy</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">Coming Soon</div>
                <div class="stat-label">Global Rank</div>
            </div>
        `;
    };

    fetchPerformance();
});
