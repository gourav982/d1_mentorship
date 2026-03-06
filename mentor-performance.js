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
    const studentPill = document.getElementById('student-pill-container');
    const studentLabel = document.getElementById('summary-student-display');

    const formatChartDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = d.getDate().toString().padStart(2, '0');
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${day}-${months[d.getMonth()]}`;
    };

    // 1. Initialize
    const init = async () => {
        currentUser = await window.syncUserProfile();
        await window.applyPermissions();

        // Dropdowns & Sidebar
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

        document.getElementById('open-profile-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('password-modal').classList.add('active');
        });
    };

    // 2. Search Logic
    const searchStudent = async () => {
        const query = searchInput.value.trim();
        if (!query) return;

        searchBtn.disabled = true;
        searchBtn.textContent = 'Searching...';
        emptyState.style.display = 'flex';
        perfContent.classList.remove('active');
        studentPill.style.display = 'none';

        try {
            let { data: student, error: fetchError } = await supabaseClient
                .from('access')
                .select('*')
                .ilike('enrolment_id', query)
                .single();

            if (fetchError || !student) {
                const { data: retryStudent } = await supabaseClient
                    .from('Access')
                    .select('*')
                    .ilike('enrolment_id', query)
                    .single();
                student = retryStudent;
            }

            if (!student) {
                alert('Student not found. Please check the Enrolment ID (e.g. TEST001).');
            } else {
                targetStudent = student;
                await loadPerformanceData(student);
            }
        } catch (err) {
            console.error('Search Error:', err);
            alert('Error searching for student.');
        } finally {
            searchBtn.disabled = false;
            searchBtn.textContent = 'Fetch Performance';
        }
    };

    // 3. Performance Logic (Cloned from dashboard.js)
    const loadPerformanceData = async (student) => {
        const today = new Date().toISOString().split('T')[0];
        const enrolmentId = student.enrolment_id;
        const studentEmail = (student.email_id || '').toLowerCase();

        try {
            // UI Transition
            studentLabel.textContent = `${student.name} • ${student.enrolment_id} (${student.centre_name})`;
            studentPill.style.display = 'block';
            emptyState.style.display = 'none';
            perfContent.classList.add('active');

            // Fetch Data
            const [schedRes, resRes] = await Promise.all([
                supabaseClient.from('Schedule').select('*').eq('centre_name', student.centre_name).lte('date', today),
                supabaseClient.from('Test_Results').select('*').or(`enrolment_id.eq.${enrolmentId},user_email.ilike.${studentEmail}`)
            ]);

            globalSchedules = schedRes.data || [];
            globalResults = resRes.data || [];

            // Widget Logic Helpers
            const getPercentiles = (type) => {
                return globalResults.filter(r => {
                    const rType = (r.test_type || '').toLowerCase().trim();
                    const targetType = type.toLowerCase().trim();
                    let matchesType = (rType === targetType);
                    if (targetType === 't&d') matchesType = rType.includes('t&d') || rType === 'test & discussion';
                    if (!matchesType) return false;
                    const val = String(r.percentile || '').replace(/[^\d.-]/g, '');
                    return val !== '' && !isNaN(parseFloat(val));
                }).map(r => parseFloat(String(r.percentile).replace(/[^\d.-]/g, '')));
            };

            const calculateMedianValue = (arr) => {
                if (!arr || arr.length === 0) return '-';
                const nums = arr.map(n => parseFloat(n)).filter(n => !isNaN(n)).sort((a, b) => a - b);
                if (nums.length === 0) return '-';
                const mid = Math.floor(nums.length / 2);
                const median = nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
                return median % 1 === 0 ? median : median.toFixed(1);
            };

            const countAppeared = (type) => {
                return globalResults.filter(r => {
                    const rType = (r.test_type || '').toLowerCase().trim();
                    const targetType = type.toLowerCase().trim();
                    let matchesType = (rType === targetType);
                    if (targetType === 't&d') matchesType = rType.includes('t&d') || rType === 'test & discussion';
                    const hasVal = (r.score && r.score !== '-') || (r.percentile && r.percentile !== '-');
                    return matchesType && hasVal;
                }).length;
            };

            const countAvailable = (type) => {
                const targetType = type.toLowerCase().trim();
                let count = 0;
                if (targetType === 'custom module') {
                    count = globalSchedules.filter(s => s.custom_module_code && s.custom_module_code !== '-').length;
                } else if (targetType === 'marrow gt') {
                    count = globalSchedules.filter(s => s.marrow_gt && s.marrow_gt !== '-').length;
                } else if (targetType === 't&d') {
                    count = globalSchedules.filter(s => {
                        const combined = `${s.type || ''} ${s.topic || ''}`.toLowerCase();
                        return combined.includes('t&d') || combined.includes('test & discussion');
                    }).length;
                }
                return count;
            };

            const updateWidget = (idPrefix, type) => {
                const appeared = countAppeared(type);
                const available = countAvailable(type);
                const median = calculateMedianValue(getPercentiles(type));

                const valEl = document.getElementById(`${idPrefix}-appeared`);
                const medEl = document.getElementById(`${idPrefix}-median`);
                const appFill = document.getElementById(`${idPrefix}-app-progress`);
                const medFill = document.getElementById(`${idPrefix}-med-progress`);

                if (valEl) valEl.textContent = `${appeared}/${available}`;
                if (medEl) medEl.textContent = median;

                const setProgress = (el, percent) => {
                    if (!el) return;
                    el.style.width = `${percent}%`;
                    el.classList.remove('progress-red', 'progress-yellow', 'progress-green');
                    if (percent < 50) el.classList.add('progress-red');
                    else if (percent < 80) el.classList.add('progress-yellow');
                    else el.classList.add('progress-green');
                };

                const appPercent = (available > 0) ? (appeared / available) * 100 : 0;
                const medValue = (median !== '-') ? parseFloat(median) : 0;
                setProgress(appFill, appPercent);
                setProgress(medFill, medValue);
            };

            updateWidget('cm', 'Custom Module');
            updateWidget('td', 'T&D');
            updateWidget('gt', 'Marrow GT');

            initCharts();

        } catch (err) {
            console.error('Performance Calc Error:', err);
        }
    };

    // --- CHART LOGIC (1:1 with dashboard.js) ---
    function initCharts() {
        populateSubjectFilters();
        updateCMChart();
        updateTDChart();
        updateGTChart();

        document.getElementById('cm-chart-date-filter')?.addEventListener('change', updateCMChart);
        document.getElementById('td-chart-subject-filter')?.addEventListener('change', updateTDChart);
    }

    function populateSubjectFilters() {
        const subjects = [...new Set(globalSchedules.map(s => s.subject).filter(Boolean))].sort();
        const options = '<option value="all">All Subjects</option>' + subjects.map(s => `<option value="${s}">${s}</option>`).join('');
        const filter = document.getElementById('td-chart-subject-filter');
        if (filter) filter.innerHTML = options;
    }

    function getFilteredData(type, days, subject) {
        let filtered = globalResults.filter(r => {
            const rType = (r.test_type || '').toLowerCase().trim();
            const targetType = type.toLowerCase().trim();
            let matchesType = (rType === targetType);
            if (targetType === 't&d') matchesType = rType.includes('t&d') || rType === 'test & discussion';
            return matchesType;
        });

        let enriched = filtered.map(r => {
            const rCode = (r.custom_module_code || '').trim();
            const rType = (r.test_type || '').toLowerCase().trim();
            const sched = globalSchedules.find(s => {
                const sType = (s.type || '').toLowerCase().trim();
                const sCode = (s.custom_module_code || '').trim();
                const sTopic = (s.topic || '').trim();
                const sGT = (s.marrow_gt || '').trim();
                const sSubject = (s.subject || '').trim();
                if (rCode && rCode !== '-' && rCode === sCode) return true;
                if (rType.includes('t&d') && sType.includes('t&d') && (rCode === sTopic || rCode === sSubject)) return true;
                if (rType.includes('marrow gt') && (rCode === sGT || rCode === sTopic || rCode === sCode)) return true;
                return false;
            });
            return { ...r, date: sched ? sched.date : null, subject: sched ? sched.subject : (rType.includes('t&d') ? rCode : null) };
        });

        if (days !== 'all') {
            const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - parseInt(days));
            const cutoffStr = cutoff.toISOString().split('T')[0];
            enriched = enriched.filter(r => r.date && r.date >= cutoffStr);
        }
        if (subject && subject !== 'all') enriched = enriched.filter(r => r.subject === subject);
        return enriched;
    }

    function updateCMChart() {
        const days = document.getElementById('cm-chart-date-filter').value;
        const data = getFilteredData('Custom Module', days, 'all').filter(d => d.date).sort((a, b) => new Date(a.date) - new Date(b.date));
        const labels = data.map(d => formatChartDate(d.date));
        const values = data.map(d => parseFloat(String(d.percentile).replace(/[^\d.-]/g, '')) || 0);

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
        data.forEach(d => { if (d.subject) { if (!subjectMap[d.subject]) subjectMap[d.subject] = []; subjectMap[d.subject].push(parseFloat(String(d.percentile).replace(/[^\d.-]/g, '')) || 0); } });
        const labels = Object.keys(subjectMap);
        const values = labels.map(l => {
            const arr = subjectMap[l];
            const sorted = arr.sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        });

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
        const values = data.map(d => parseFloat(String(d.percentile).replace(/[^\d.-]/g, '')) || 0);

        if (gtChart) gtChart.destroy();
        const ctx = document.getElementById('gt-performance-chart').getContext('2d');
        gtChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'GT Percentile', data: values, backgroundColor: 'rgba(245, 158, 11, 0.4)', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } }
        });
    }

    // Handlers
    searchBtn.addEventListener('click', searchStudent);
    searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchStudent(); });

    init();
});
