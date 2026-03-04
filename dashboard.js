document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check Session First
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }

    // 2. ALWAYS INITIALIZE GLOBAL UI (Logout, Dropdowns)
    const profileBtn = document.getElementById('user-profile-btn');
    const nameDisplay = document.getElementById('display-name');
    const roleDisplay = document.getElementById('display-role');
    const avatarCircle = document.getElementById('avatar-circle');

    // Chart Instances
    let cmChart = null;
    let tdChart = null;
    let gtChart = null;

    // Data Storage for Charts
    let globalSchedules = [];
    let globalResults = [];

    const formatChartDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const day = d.getDate().toString().padStart(2, '0');
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${day}-${months[d.getMonth()]}`;
    };

    // Sidebar Toggle
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle-btn');

    // Auto-collapse on mobile initial load
    if (window.innerWidth <= 768) {
        sidebar?.classList.add('collapsed');
    }

    sidebarToggle?.addEventListener('click', () => {
        sidebar?.classList.toggle('collapsed');
    });

    // Make dropdown work immediately
    profileBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        profileBtn.classList.toggle('active');
    });
    document.addEventListener('click', () => profileBtn?.classList.remove('active'));

    // Make Logout work immediately
    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await supabaseClient.auth.signOut();
        window.location.replace('index.html');
    });

    try {
        // 3. Fetch User Profile
        const { data: userData, error: fetchError } = await supabaseClient
            .from('Access')
            .select('*, User_Status(is_active)')
            .ilike('email_id', session.user.email)
            .single();

        if (fetchError || !userData) {
            console.warn('Profile not found for:', session.user.email);
            nameDisplay.textContent = session.user.email.split('@')[0];
            roleDisplay.textContent = 'Account Pending';
            avatarCircle.textContent = '?';
            return; // Profiles details below won't load, but logout stays active!
        }

        // 4. Auto-Sync & Status
        if (!userData.user_id) {
            await supabaseClient.from('Access').update({ user_id: session.user.id }).eq('email_id', userData.email_id);
        }

        const isActive = (userData.User_Status && userData.User_Status.is_active !== undefined)
            ? userData.User_Status.is_active : true;

        if (isActive === false) {
            await supabaseClient.auth.signOut();
            window.location.replace('index.html');
            return;
        }

        // 5. Success UI Update
        nameDisplay.textContent = userData.name || 'User';
        roleDisplay.textContent = userData.role || 'Member';
        avatarCircle.textContent = (userData.name || 'U').charAt(0).toUpperCase();

        const adminRoles = ['Super admin', 'Admin', 'Mentor', 'Academics'];
        if (adminRoles.includes(userData.role)) {
            const adminSec = document.getElementById('admin-section');
            if (adminSec) adminSec.style.display = 'block';
        }

        // 6. Modal Fill Logic
        const openModal = () => {
            document.getElementById('profile-name').value = userData.name || '';
            document.getElementById('profile-email').value = userData.email_id || '';
            document.getElementById('profile-phone') ? document.getElementById('profile-phone').value = userData.phone_number || '' : null;
            document.getElementById('password-modal').classList.add('active');
        };

        document.getElementById('open-profile-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            openModal();
        });

        // 7. Force Password Reset if is_first_login is TRUE
        if (userData.is_first_login) {
            openModal();
            // Optional: Hide close button to force reset
            const closeBtn = document.querySelector('.modal-close-btn');
            if (closeBtn) closeBtn.style.display = 'none';
        }

        // 8. Handle Password Update Form
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
                    alert('Password updated successfully! Please login again with your new password.');
                    await supabaseClient.auth.signOut();
                    window.location.replace('index.html');
                } else {
                    alert('Error: ' + result.message);
                    btn.disabled = false;
                    btn.textContent = 'Update Password';
                }
            });
        }

        // 9. Onboarding Check (Only if they've reset their password)
        if (userData.role === 'Students' && (userData.is_onboarded === false || userData.is_onboarded === null || userData.is_onboarded === undefined)) {
            const onboardingModal = document.getElementById('onboarding-modal');
            if (onboardingModal) onboardingModal.classList.add('active');
        }

        const onboardingForm = document.getElementById('onboarding-form');
        if (onboardingForm) {
            onboardingForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const exam = document.getElementById('onboarding-exam').value;
                const targetRank = document.getElementById('onboarding-target-rank').value;
                const gtScore = document.getElementById('onboarding-gt-score').value;
                const gtPercentile = document.getElementById('onboarding-gt-percentile').value;
                const challenge = document.getElementById('onboarding-challenge').value;
                const expectation = document.getElementById('onboarding-expectation').value;
                const submitBtn = document.getElementById('onboarding-submit');

                submitBtn.disabled = true;
                submitBtn.textContent = 'Saving...';

                try {
                    const { error: onboardingError } = await supabaseClient
                        .from('Onboarding_Data')
                        .insert([{
                            user_id: userData.user_id,
                            email_id: userData.email_id,
                            target_exam: exam,
                            target_rank: targetRank ? parseInt(targetRank) : null,
                            latest_gt_score: gtScore ? parseFloat(gtScore) : null,
                            latest_gt_percentile: gtPercentile ? parseFloat(gtPercentile) : null,
                            biggest_challenge: challenge,
                            mentorship_expectation: expectation
                        }]);

                    if (onboardingError) throw onboardingError;

                    await supabaseClient.from('Access').update({
                        is_onboarded: true,
                        onboarding_date: new Date().toISOString()
                    }).eq('email_id', userData.email_id);

                    document.getElementById('onboarding-modal').classList.remove('active');
                    alert('Successfully onboarded! Welcome to DBMCI One Mentorship.');
                } catch (err) {
                    alert('Error saving onboarding data: ' + err.message);
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Complete Onboarding';
                }
            });
        }

        // 10. Performance Dashboard Logic
        const loadPerformanceData = async () => {
            const today = new Date().toISOString().split('T')[0];
            const enrolmentId = userData.enrolment_id;

            try {
                const userCentre = userData.centre_name ? userData.centre_name.trim() : null;
                console.log('📊 Stats for centre:', userCentre, 'Enrolment:', enrolmentId);

                // Fetch Schedules up to today for the user's centre
                const { data: schedules, error: schedError } = await supabaseClient
                    .from('Schedule')
                    .select('type, date, custom_module_code, marrow_gt, subject, topic')
                    .eq('centre_name', userCentre)
                    .lte('date', today);

                // Fetch Results for the user - Use ilike for case-insensitive email matching
                const { data: results, error: resError } = await supabaseClient
                    .from('Test_Results')
                    .select('test_type, score, percentile, custom_module_code, enrolment_id, user_email')
                    .or(`enrolment_id.eq.${enrolmentId},user_email.ilike.${userData.email_id.toLowerCase()}`);

                if (schedError || resError) {
                    console.error('❌ Data Fetch Error:', schedError || resError);
                    return;
                }

                console.log('📅 Found', schedules?.length, 'Scheduled Tests till today.');
                console.log('🏆 Found', results?.length, 'Results for user.');

                // Helper to count valid appearances
                const countAppeared = (type) => {
                    const filtered = (results || []).filter(r => {
                        const rType = (r.test_type || '').toLowerCase().trim();
                        const targetType = type.toLowerCase().trim();

                        let matchesType = (rType === targetType);
                        if (targetType === 't&d') matchesType = rType.includes('t&d') || rType === 'test & discussion';

                        const hasScore = r.score && r.score !== '-' && r.score !== '';
                        const hasPerc = r.percentile && r.percentile !== '-' && r.percentile !== '';
                        return matchesType && (hasScore || hasPerc);
                    });
                    return filtered.length;
                };

                // Helper to calculate median
                const calculateMedian = (arr) => {
                    if (!arr || arr.length === 0) return '-';
                    const nums = arr.map(n => parseFloat(n)).filter(n => !isNaN(n)).sort((a, b) => a - b);
                    if (nums.length === 0) return '-';
                    const mid = Math.floor(nums.length / 2);
                    const median = nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
                    return median % 1 === 0 ? median : median.toFixed(1);
                };

                // Helper to get percentiles for a type
                const getPercentiles = (type) => {
                    const pList = (results || []).filter(r => {
                        const rType = (r.test_type || '').toLowerCase().trim();
                        const targetType = type.toLowerCase().trim();
                        let matchesType = (rType === targetType);
                        if (targetType === 't&d') matchesType = rType.includes('t&d') || rType === 'test & discussion';

                        if (!matchesType) return false;

                        let val = r.percentile;
                        // Handle null, undefined, placeholder
                        if (val === undefined || val === null || val === '-' || val === '') return false;

                        // Clean value (remove % or other suffix)
                        const cleanVal = String(val).replace(/[^\d.-]/g, '');
                        return cleanVal !== '' && !isNaN(parseFloat(cleanVal));
                    }).map(r => parseFloat(String(r.percentile).replace(/[^\d.-]/g, '')));

                    console.log(`📈 Valid percentiles for ${type}:`, pList);
                    return pList;
                };

                // Helper to count available tests till today
                const countAvailable = (type) => {
                    const targetType = type.toLowerCase().trim();
                    let count = 0;
                    if (targetType === 'custom module') {
                        count = (schedules || []).filter(s => s.custom_module_code && s.custom_module_code !== '-' && s.custom_module_code !== '').length;
                    } else if (targetType === 'marrow gt') {
                        count = (schedules || []).filter(s => s.marrow_gt && s.marrow_gt !== '-' && s.marrow_gt !== '').length;
                    } else if (targetType === 't&d') {
                        count = (schedules || []).filter(s => {
                            const combined = `${s.type || ''} ${s.topic || ''}`.toLowerCase();
                            return combined.includes('t&d') || combined.includes('test & discussion');
                        }).length;
                    } else {
                        count = (schedules || []).filter(s => (s.type || '').toLowerCase().includes(targetType)).length;
                    }
                    return count;
                };

                // Update UI with robust check
                const updateWidget = (idPrefix, type) => {
                    const appeared = countAppeared(type);
                    const available = countAvailable(type);
                    const medianList = getPercentiles(type);
                    const median = calculateMedian(medianList);

                    const valueEl = document.getElementById(`${idPrefix}-appeared`);
                    const medianEl = document.getElementById(`${idPrefix}-median`);
                    const appFill = document.getElementById(`${idPrefix}-app-progress`);
                    const medFill = document.getElementById(`${idPrefix}-med-progress`);

                    if (valueEl) valueEl.textContent = `${appeared}/${available}`;
                    if (medianEl) medianEl.textContent = median;

                    // Helper to color-code and set width
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

                // Store for charts
                globalSchedules = schedules || [];
                globalResults = results || [];

                // Initialize Charts
                initCharts();

            } catch (err) {
                console.error('💥 Performance Calc Error:', err);
            }
        };

        if (userData.role === 'Students') {
            await loadPerformanceData();
        } else {
            // Hide performance grid for non-students or show admin version (future)
            const perfGrid = document.querySelector('.performance-grid');
            if (perfGrid) perfGrid.style.opacity = '0.3';
        }

    } catch (err) {
        console.error('Data Load Error:', err);
    }

    // --- CHART LOGIC ---
    function initCharts() {
        populateSubjectFilters();
        updateCMChart();
        updateTDChart();
        updateGTChart();

        // Add Listeners
        document.getElementById('cm-chart-date-filter')?.addEventListener('change', updateCMChart);
        document.getElementById('cm-chart-subject-filter')?.addEventListener('change', updateCMChart);
        document.getElementById('td-chart-date-filter')?.addEventListener('change', updateTDChart);
        document.getElementById('td-chart-subject-filter')?.addEventListener('change', updateTDChart);
        document.getElementById('gt-chart-date-filter')?.addEventListener('change', updateGTChart);
    }

    function populateSubjectFilters() {
        const subjects = [...new Set(globalSchedules.map(s => s.subject).filter(Boolean))].sort();
        const options = '<option value="all">All Subjects</option>' +
            subjects.map(s => `<option value="${s}">${s}</option>`).join('');

        const cmFilter = document.getElementById('cm-chart-subject-filter');
        const tdFilter = document.getElementById('td-chart-subject-filter');
        if (cmFilter) cmFilter.innerHTML = options;
        if (tdFilter) tdFilter.innerHTML = options;
    }

    function getFilteredData(type, days, subject) {
        let filtered = globalResults.filter(r => {
            const rType = (r.test_type || '').toLowerCase().trim();
            const targetType = type.toLowerCase().trim();
            let matchesType = (rType === targetType);
            if (targetType === 't&d') matchesType = rType.includes('t&d') || rType === 'test & discussion';
            return matchesType;
        });

        // Link with schedule to get date and subject
        let enriched = filtered.map(r => {
            const rCode = (r.custom_module_code || '').trim();
            const rType = (r.test_type || '').toLowerCase().trim();

            const sched = globalSchedules.find(s => {
                const sType = (s.type || '').toLowerCase().trim();
                const sCode = (s.custom_module_code || '').trim();
                const sTopic = (s.topic || '').trim();
                const sGT = (s.marrow_gt || '').trim();
                const sSubject = (s.subject || '').trim();

                // 1. Direct code match (Custom Modules)
                if (rCode && rCode !== '-' && rCode === sCode) return true;

                // 2. Type and Subject/Topic match (for T&D where results code is often the subject/topic)
                if (rType.includes('t&d') || rType === 'test & discussion') {
                    if (sType.includes('t&d')) {
                        if (rCode === sTopic || rCode === sSubject || rCode.includes(sSubject)) return true;
                    }
                }

                // 3. Marrow GT match
                if (rType.includes('marrow gt')) {
                    if (rCode === sGT || rCode === sTopic || rCode === sCode) return true;
                }

                return false;
            });

            // Enrichment with Fallback: For T&D, if no schedule match, assume the Code IS the subject
            return {
                ...r,
                date: sched ? sched.date : null,
                subject: sched ? sched.subject : (rType.includes('t&d') ? rCode : null)
            };
        });

        // Date Filter
        if (days !== 'all') {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - parseInt(days));
            const cutoffStr = cutoff.toISOString().split('T')[0];
            enriched = enriched.filter(r => r.date && r.date >= cutoffStr);
        }

        // Subject Filter
        if (subject && subject !== 'all') {
            enriched = enriched.filter(r => r.subject === subject);
        }

        return enriched;
    }

    function updateCMChart() {
        const days = document.getElementById('cm-chart-date-filter').value;
        const subject = document.getElementById('cm-chart-subject-filter').value;
        const data = getFilteredData('Custom Module', days, subject);

        // Group by Date for Y-axis
        const sorted = data.filter(d => d.date).sort((a, b) => new Date(a.date) - new Date(b.date));
        const labels = sorted.map(d => formatChartDate(d.date));
        const values = sorted.map(d => parseFloat(String(d.percentile).replace(/[^\d.-]/g, '')) || 0);

        const median = calculateMedianValue(values);

        if (cmChart) cmChart.destroy();
        const ctx = document.getElementById('cm-performance-chart').getContext('2d');
        cmChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Percentile',
                    data: values,
                    backgroundColor: 'rgba(56, 189, 248, 0.4)',
                    borderColor: '#38bdf8',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false }, title: { display: true, text: 'Date', color: '#94a3b8' } },
                    y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Percentile', color: '#94a3b8' } }
                },
                plugins: {
                    legend: { display: false },
                    annotation: {
                        annotations: {
                            line1: {
                                type: 'line',
                                yMin: median,
                                yMax: median,
                                borderColor: 'rgba(239, 68, 68, 0.8)',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: { content: `Median: ${median}`, display: true, position: 'end' }
                            }
                        }
                    }
                }
            }
        });
    }

    function updateTDChart() {
        const days = document.getElementById('td-chart-date-filter').value;
        const subject = document.getElementById('td-chart-subject-filter').value;

        let data = getFilteredData('T&D', days, subject);

        // Group by Subject
        const subjectMap = {};
        data.forEach(d => {
            if (d.subject) {
                if (!subjectMap[d.subject]) subjectMap[d.subject] = [];
                subjectMap[d.subject].push(parseFloat(String(d.percentile).replace(/[^\d.-]/g, '')) || 0);
            }
        });

        const labels = Object.keys(subjectMap);
        const values = labels.map(l => calculateMedianValue(subjectMap[l]));
        const overallMedian = calculateMedianValue(values);

        if (tdChart) tdChart.destroy();
        const ctx = document.getElementById('td-performance-chart').getContext('2d');
        tdChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Subject Percentile',
                    data: values,
                    backgroundColor: 'rgba(34, 197, 94, 0.4)',
                    borderColor: '#22c55e',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false }, title: { display: true, text: 'Subject', color: '#94a3b8' } },
                    y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Percentile', color: '#94a3b8' } }
                },
                plugins: {
                    legend: { display: false },
                    annotation: {
                        annotations: {
                            line1: {
                                type: 'line',
                                yMin: overallMedian,
                                yMax: overallMedian,
                                borderColor: 'rgba(239, 68, 68, 0.8)',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: { content: `Overall Median: ${overallMedian}`, display: true }
                            }
                        }
                    }
                }
            }
        });
    }

    function updateGTChart() {
        const days = document.getElementById('gt-chart-date-filter').value;
        let data = getFilteredData('Marrow GT', days, 'all');

        // Use test name as label (GT Name)
        const sorted = data.filter(d => d.custom_module_code).sort((a, b) => new Date(a.date) - new Date(b.date));
        const labels = sorted.map(d => d.custom_module_code); // For Marrow GT, the code is often the name
        const values = sorted.map(d => parseFloat(String(d.percentile).replace(/[^\d.-]/g, '')) || 0);

        const median = calculateMedianValue(values);

        if (gtChart) gtChart.destroy();
        const ctx = document.getElementById('gt-performance-chart').getContext('2d');
        gtChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'GT Percentile',
                    data: values,
                    backgroundColor: 'rgba(245, 158, 11, 0.4)',
                    borderColor: '#f59e0b',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { display: false }, title: { display: true, text: 'Marrow GT', color: '#94a3b8' } },
                    y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, title: { display: true, text: 'Percentile', color: '#94a3b8' } }
                },
                plugins: {
                    legend: { display: false },
                    annotation: {
                        annotations: {
                            line1: {
                                type: 'line',
                                yMin: median,
                                yMax: median,
                                borderColor: 'rgba(239, 68, 68, 0.8)',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: { content: `Median: ${median}`, display: true }
                            }
                        }
                    }
                }
            }
        });
    }

    function calculateMedianValue(arr) {
        if (!arr || arr.length === 0) return 0;
        const nums = arr.map(n => parseFloat(n)).filter(n => !isNaN(n)).sort((a, b) => a - b);
        if (nums.length === 0) return 0;
        const mid = Math.floor(nums.length / 2);
        const median = nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
        return parseFloat(median.toFixed(1));
    }
});
