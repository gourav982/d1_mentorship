document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = null;
    let targetStudent = null;
    let globalSchedules = [];
    let globalResults = [];

    // Chart Instances
    let cmChart = null;
    let tdChart = null;
    let gtChart = null;

    const searchInput = document.getElementById('student-search-input');
    const searchBtn = document.getElementById('btn-search-student');
    const emptyState = document.getElementById('empty-state');
    const perfContent = document.getElementById('perf-content');
    const profileSummary = document.getElementById('student-profile-summary');

    // 1. Initialize Mentor Sidebar/Profile
    const init = async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

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

        window.applyPermissions();

        // Listeners for Profile Dropdown/Logouts (Standard)
        const profileBtn = document.getElementById('user-profile-btn');
        profileBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            profileBtn.classList.toggle('active');
        });
        document.addEventListener('click', () => profileBtn?.classList.remove('active'));

        document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await supabaseClient.auth.signOut();
            window.location.replace('index.html');
        });

        const sidebar = document.querySelector('.sidebar');
        const sidebarToggle = document.getElementById('sidebar-toggle-btn');
        sidebarToggle?.addEventListener('click', () => sidebar?.classList.toggle('collapsed'));
    };

    // 2. Search Logic
    const searchStudent = async () => {
        const query = searchInput.value.trim();
        if (!query) return;

        searchBtn.disabled = true;
        searchBtn.textContent = 'Searching...';
        emptyState.style.display = 'flex';
        perfContent.classList.remove('active');
        profileSummary.style.display = 'none';

        try {
            // Find student by enrolment ID with resilience
            let { data: student, error: fetchError } = await supabaseClient
                .from('access')
                .select('*')
                .ilike('enrolment_id', query)
                .single();

            if (fetchError || !student) {
                // Retry with uppercase Access
                const { data: retryStudent, error: retryError } = await supabaseClient
                    .from('Access')
                    .select('*')
                    .ilike('enrolment_id', query)
                    .single();

                student = retryStudent;
                if (!student) {
                    alert('Student not found. Please check the Enrolment ID (e.g. TEST001).');
                    return;
                }
            }

            targetStudent = student;
            await loadStudentPerformance(student);
        } catch (err) {
            console.error('Search Error:', err);
            alert('Error searching for student. Please try again.');
        } finally {
            searchBtn.disabled = false;
            searchBtn.textContent = 'Fetch Performance';
        }
    };

    // 3. Data Loading & Calculation (Adapted from dashboard.js)
    const loadStudentPerformance = async (student) => {
        try {
            const [schedRes, resRes] = await Promise.all([
                supabaseClient.from('Schedule').select('*').order('date', { ascending: true }),
                supabaseClient.from('Test_Results').select('*').ilike('email_id', student.email_id)
            ]);

            globalSchedules = schedRes.data || [];
            globalResults = resRes.data || [];

            // UI Transitions
            emptyState.style.display = 'none';
            profileSummary.style.display = 'block';
            document.getElementById('summary-student-name').textContent = student.name;
            document.getElementById('summary-student-meta').textContent = `${student.enrolment_id} • ${student.centre_name}`;

            perfContent.classList.add('active');

            calculatePerformance();
            initCharts();
        } catch (err) {
            console.error('Data Load Error:', err);
        }
    };

    const calculatePerformance = () => {
        const calculateMedian = (arr) => {
            if (!arr || arr.length === 0) return '-';
            const nums = arr.map(n => parseFloat(String(n).replace(/[^\d.-]/g, ''))).filter(n => !isNaN(n)).sort((a, b) => a - b);
            if (nums.length === 0) return '-';
            const mid = Math.floor(nums.length / 2);
            return nums.length % 2 !== 0 ? nums[mid].toFixed(1) : ((nums[mid - 1] + nums[mid]) / 2).toFixed(1);
        };

        const getPercentiles = (targetType) => {
            return globalResults.filter(r => {
                const rType = (r.test_type || '').toLowerCase().trim();
                const tType = targetType.toLowerCase().trim();
                if (tType === 't&d') return rType.includes('t&d') || rType === 'test & discussion';
                return rType === tType;
            }).map(r => r.percentile);
        };

        const countAppeared = (targetType) => {
            return globalResults.filter(r => {
                const rType = (r.test_type || '').toLowerCase().trim();
                const tType = targetType.toLowerCase().trim();
                if (tType === 't&d') return rType.includes('t&d') || rType === 'test & discussion';
                return rType === tType;
            }).length;
        };

        const countAvailable = (targetType) => {
            if (targetType === 'Custom Module') return globalSchedules.filter(s => s.custom_module_code && s.custom_module_code !== '-').length;
            if (targetType === 'Marrow GT') return globalSchedules.filter(s => s.marrow_gt && s.marrow_gt !== '-').length;
            if (targetType === 'T&D') return globalSchedules.filter(s => (s.type || '').toLowerCase().includes('t&d')).length;
            return 0;
        };

        const updateWidget = (idPrefix, type) => {
            const appeared = countAppeared(type);
            const available = countAvailable(type);
            const median = calculateMedian(getPercentiles(type));

            document.getElementById(`${idPrefix}-appeared`).textContent = `${appeared}/${available}`;
            document.getElementById(`${idPrefix}-median`).textContent = median;

            const appFill = document.getElementById(`${idPrefix}-app-progress`);
            const medFill = document.getElementById(`${idPrefix}-med-progress`);

            const appPercent = (available > 0) ? (appeared / available) * 100 : 0;
            const medValue = (median !== '-') ? parseFloat(median) : 0;

            if (appFill) {
                appFill.style.width = `${appPercent}%`;
                appFill.className = 'progress-fill ' + (appPercent < 50 ? 'progress-red' : appPercent < 80 ? 'progress-yellow' : 'progress-green');
            }
            if (medFill) {
                medFill.style.width = `${medValue}%`;
                medFill.className = 'progress-fill ' + (medValue < 50 ? 'progress-red' : medValue < 80 ? 'progress-yellow' : 'progress-green');
            }
        };

        updateWidget('cm', 'Custom Module');
        updateWidget('td', 'T&D');
        updateWidget('gt', 'Marrow GT');
    };

    // --- CHART LOGIC (Adapted) ---
    function initCharts() {
        populateSubjectFilters();
        updateCMChart();
        updateTDChart();
        updateGTChart();
    }

    function populateSubjectFilters() {
        const subjects = [...new Set(globalSchedules.map(s => s.subject).filter(Boolean))].sort();
        const options = '<option value="all">All Subjects</option>' + subjects.map(s => `<option value="${s}">${s}</option>`).join('');
        const tdFilter = document.getElementById('td-chart-subject-filter');
        if (tdFilter) tdFilter.innerHTML = options;
    }

    function formatChartDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return `${d.getDate()}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}`;
    }

    function getFilteredData(type, days, subject) {
        let filtered = globalResults.filter(r => {
            const rType = (r.test_type || '').toLowerCase().trim();
            const targetType = type.toLowerCase().trim();
            if (targetType === 't&d') return rType.includes('t&d') || rType === 'test & discussion';
            return rType === targetType;
        });

        let enriched = filtered.map(r => {
            const sched = globalSchedules.find(s => (s.custom_module_code === r.custom_module_code && r.test_type === 'Custom Module') ||
                ((s.topic === r.custom_module_code || s.marrow_gt === r.custom_module_code) && r.test_type !== 'Custom Module'));
            return { ...r, date: sched ? sched.date : null, subject: sched ? sched.subject : r.custom_module_code };
        });

        if (days && days !== 'all') enriched = enriched.filter(r => r.date && new Date(r.date) > new Date(Date.now() - (days * 86400000)));
        if (subject && subject !== 'all') enriched = enriched.filter(r => r.subject === subject);
        return enriched;
    }

    function updateCMChart() {
        const days = document.getElementById('cm-chart-date-filter').value;
        const data = getFilteredData('Custom Module', days, 'all').filter(d => d.date).sort((a, b) => new Date(a.date) - new Date(b.date));
        const labels = data.map(d => formatChartDate(d.date));
        const values = data.map(d => parseFloat(d.percentile) || 0);

        if (cmChart) cmChart.destroy();
        const ctx = document.getElementById('cm-performance-chart').getContext('2d');
        cmChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Percentile', data: values, backgroundColor: 'rgba(56, 189, 248, 0.4)', borderColor: '#38bdf8', borderWidth: 1, borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } }
        });
    }

    function updateTDChart() {
        const subject = document.getElementById('td-chart-subject-filter').value;
        const data = getFilteredData('T&D', 'all', subject);
        const subjectMap = {};
        data.forEach(d => { if (d.subject) { if (!subjectMap[d.subject]) subjectMap[d.subject] = []; subjectMap[d.subject].push(parseFloat(d.percentile) || 0); } });
        const labels = Object.keys(subjectMap);
        const values = labels.map(l => (subjectMap[l].reduce((a, b) => a + b, 0) / subjectMap[l].length).toFixed(1));

        if (tdChart) tdChart.destroy();
        const ctx = document.getElementById('td-performance-chart').getContext('2d');
        tdChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Median Percentile', data: values, backgroundColor: 'rgba(34, 197, 94, 0.4)', borderColor: '#22c55e', borderWidth: 1, borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } }
        });
    }

    function updateGTChart() {
        const data = getFilteredData('Marrow GT', 'all', 'all').filter(d => d.date).sort((a, b) => new Date(a.date) - new Date(b.date));
        const labels = data.map(d => d.custom_module_code);
        const values = data.map(d => parseFloat(d.percentile) || 0);

        if (gtChart) gtChart.destroy();
        const ctx = document.getElementById('gt-performance-chart').getContext('2d');
        gtChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'GT Percentile', data: values, backgroundColor: 'rgba(245, 158, 11, 0.4)', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } }
        });
    }

    // UI Wire-up
    searchBtn.addEventListener('click', searchStudent);
    searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchStudent(); });
    document.getElementById('cm-chart-date-filter')?.addEventListener('change', updateCMChart);
    document.getElementById('td-chart-subject-filter')?.addEventListener('change', updateTDChart);

    init();
});
