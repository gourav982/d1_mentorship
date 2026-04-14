document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = null;
    let students = [];
    let schedules = [];
    let testResults = [];
    let processedData = [];

    // Sorting State
    let currentSortColumn = 'name';
    let currentSortAsc = true;

    const tbody = document.getElementById('batch-tbody');

    const init = async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            window.location.replace('index.html');
            return;
        }

        // Use the syncUserProfile to get basic data
        currentUser = await window.syncUserProfile();
        
        // Wait for permissions layout
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

        setupSorting();
        
        document.getElementById('apply-filters').addEventListener('click', renderTable);
        document.getElementById('search-student').addEventListener('input', renderTable);
        
        const centreFilter = document.getElementById('centre-filter');
        if (centreFilter) {
            centreFilter.addEventListener('change', renderTable);
        }

        document.getElementById('date-condition').addEventListener('change', (e) => {
            const val = e.target.value;
            const d1 = document.getElementById('date-val-1');
            const d2 = document.getElementById('date-val-2');

            d1.style.display = 'none';
            d2.style.display = 'none';

            if (val === 'between') {
                d1.style.display = 'block';
                d2.style.display = 'block';
            } else if (val !== 'all') {
                d1.style.display = 'block';
            }
            renderTable(); // optionally auto-render on change
        });
        
        ['date-val-1', 'date-val-2'].forEach(id => {
            document.getElementById(id).addEventListener('change', renderTable);
        });

        await fetchData();
    };

    const fetchData = async () => {
        try {
            // First initialize the Centre Dropdown for Admins
            const isAdmin = currentUser && (currentUser.role === 'Super admin' || currentUser.role === 'Admin');
            const centreFilterGroup = document.getElementById('centre-filter-group');
            const centreSelect = document.getElementById('centre-filter');

            if (isAdmin && centreFilterGroup && centreSelect) {
                centreFilterGroup.style.display = 'flex';
                // Fetch all unique centres from access table
                let { data: centreData } = await supabaseClient.from('access').select('centre_name');
                if (!centreData) {
                    const retry = await supabaseClient.from('Access').select('centre_name');
                    centreData = retry.data;
                }
                
                if (centreData) {
                    const uniqueCentres = [...new Set(centreData.map(c => c.centre_name).filter(Boolean))].sort();
                    centreSelect.innerHTML = `<option value="all">All Centres</option>` + 
                        uniqueCentres.map(c => `<option value="${c}">${c}</option>`).join('');
                }
            }

            // Fetch Students Paginated (Bypass 1000 row API limit cap)
            let allStudents = [];
            let sFrom = 0;
            const sStep = 1000;
            let useCapital = false;

            while (true) {
                let studentsQuery = supabaseClient.from(useCapital ? 'Access' : 'access').select('enrolment_id, name, email_id, centre_name').eq('role', 'Students').range(sFrom, sFrom + sStep - 1);
                
                if (!isAdmin) {
                    if (currentUser && currentUser.centre_name) {
                        studentsQuery = studentsQuery.eq('centre_name', currentUser.centre_name);
                    }
                }
                
                const { data: stdData, error: stdErr } = await studentsQuery;

                if (stdErr && !useCapital) {
                    useCapital = true;
                    continue; // Seamlessly retry with capitalized table name and re-run chunk
                }
                if (stdErr) throw stdErr;
                
                if (!stdData || stdData.length === 0) break;
                allStudents = allStudents.concat(stdData);
                if (stdData.length < sStep) break;
                sFrom += sStep;
            }
            students = allStudents;

            // Fetch Global Test Results & Schedules (so we can filter by date)
            const [resSched] = await Promise.all([
                supabaseClient.from('Schedule').select('custom_module_code, marrow_gt, topic, subject, date, type, centre_name')
            ]);
            
            let allRes = [];
            let rFrom = 0;
            const rStep = 1000;
            while (true) {
                const { data, error } = await supabaseClient.from('Test_Results').select('*').range(rFrom, rFrom + rStep - 1);
                if (error) throw error;
                if (!data || data.length === 0) break;
                allRes = allRes.concat(data);
                if (data.length < rStep) break;
                rFrom += rStep;
            }

            schedules = resSched.data || [];
            testResults = allRes;
            
            processData();
            renderTable();

        } catch (err) {
            console.error("Error fetching batch data:", err);
            tbody.innerHTML = `<tr><td colspan="7" style="color:#ef4444;text-align:center;">Failed to load data.</td></tr>`;
        }
    };

    const processData = () => {
        const resultsByEmail = {};
        const resultsByEnrolment = {};

        for (let r of testResults) {
            const rEmail = (r.user_email || '').toLowerCase().trim();
            const rID = (r.enrolment_id || '').toLowerCase().trim();
            if (rEmail) {
                if (!resultsByEmail[rEmail]) resultsByEmail[rEmail] = [];
                resultsByEmail[rEmail].push(r);
            }
            if (rID) {
                if (!resultsByEnrolment[rID]) resultsByEnrolment[rID] = [];
                resultsByEnrolment[rID].push(r);
            }
        }

        processedData = students.map(student => {
            const sEmail = (student.email_id || '').toLowerCase().trim();
            const sID = (student.enrolment_id || '').toLowerCase().trim();
            
            let combined = [];
            if (sEmail && resultsByEmail[sEmail]) combined = combined.concat(resultsByEmail[sEmail]);
            if (sID && resultsByEnrolment[sID]) combined = combined.concat(resultsByEnrolment[sID]);
            
            const studentResults = [...new Set(combined)];
            
            // Enrich with date from schedule
            const enrichedResults = studentResults.map(r => {
                const rCode = (r.custom_module_code || '').trim();
                const rType = (r.test_type || '').toLowerCase().trim();
                const sched = schedules.find(s => {
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
                return { ...r, date: sched ? sched.date : null };
            });

            return {
                ...student,
                results: enrichedResults
            };
        });
    };

    const calculateMedian = (arr) => {
        const nums = arr.map(n => parseFloat(n)).filter(n => !isNaN(n)).sort((a, b) => a - b);
        if (nums.length === 0) return '-';
        const mid = Math.floor(nums.length / 2);
        const median = nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
        return median % 1 === 0 ? median : median.toFixed(1);
    };

    const isWithinDate = (dateStr, condition, d1, d2) => {
        if (condition === 'all') return true;
        if (!dateStr) return false;
        
        // Strip time component robustly
        const timestamp = Date.parse(dateStr);
        if (isNaN(timestamp)) return false;
        
        const targetDate = new Date(timestamp);
        targetDate.setHours(0, 0, 0, 0);
        const targetTime = targetDate.getTime();

        const parseLocal = (dtStr) => {
            if (!dtStr) return null;
            const d = new Date(dtStr);
            if (isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d.getTime();
        };

        const t1 = parseLocal(d1);
        const t2 = parseLocal(d2);

        if (condition === 'on' && t1 !== null) {
            return targetTime === t1;
        } else if (condition === 'before' && t1 !== null) {
            return targetTime < t1;
        } else if (condition === 'after' && t1 !== null) {
            return targetTime > t1;
        } else if (condition === 'since' && t1 !== null) {
            return targetTime >= t1;
        } else if (condition === 'between' && t1 !== null && t2 !== null) {
            const start = Math.min(t1, t2);
            const end = Math.max(t1, t2);
            return targetTime >= start && targetTime <= end;
        }
        
        return true;
    };

    const getMetrics = (studentData, condition, d1, d2) => {
        const results = studentData.results.filter(r => isWithinDate(r.date, condition, d1, d2));
        
        
        const parseType = (type) => (type || '').toLowerCase().trim();
        const getPercentiles = (type) => results
            .filter(r => parseType(r.test_type).includes(type) && r.percentile && r.percentile !== '-')
            .map(r => String(r.percentile).replace(/[^\d.-]/g, ''));
            
        const getCount = (type) => results
            .filter(r => parseType(r.test_type).includes(type) && (r.score !== '-' || r.percentile !== '-'))
            .length;

        const cmCount = getCount('custom module');
        const tdCount = getCount('t&d') || getCount('test & discussion');
        const gtCount = getCount('marrow gt');

        const cmMedian = calculateMedian(getPercentiles('custom module'));
        const tdMedian = calculateMedian(getPercentiles('t&d').concat(getPercentiles('test & discussion')));
        const gtMedian = calculateMedian(getPercentiles('marrow gt'));

        return { cmCount, cmMedian, tdCount, tdMedian, gtCount, gtMedian };
    };

    const renderTable = () => {
        const dateCondition = document.getElementById('date-condition').value;
        const dateVal1 = document.getElementById('date-val-1').value;
        const dateVal2 = document.getElementById('date-val-2').value;
        const searchQuery = document.getElementById('search-student').value.toLowerCase().trim();
        const selectedCentre = document.getElementById('centre-filter')?.value || 'all';

        // Filter students by selected centre if Admin is using the dropdown
        let activeStudents = processedData;
        if (selectedCentre !== 'all') {
            activeStudents = activeStudents.filter(s => s.centre_name === selectedCentre);
        }

        // --- UPDATE PERFORMANCE WIDGETS ---
        // Get all unique centres currently being analyzed
        const relevantCentres = new Set(activeStudents.map(s => s.centre_name).filter(Boolean));
        
        let baseSchedules = schedules;
        if (relevantCentres.size > 0) {
            baseSchedules = baseSchedules.filter(s => relevantCentres.has(s.centre_name));
        }

        const dateFilteredSchedules = baseSchedules.filter(s => isWithinDate(s.date, dateCondition, dateVal1, dateVal2));
        
        // Setup Elapsed logic
        const todayStr = new Date().toISOString().split('T')[0];
        const todayTime = new Date(todayStr).getTime();
        
        const elapsedSchedules = dateFilteredSchedules.filter(s => {
            if (!s.date) return false;
            const t = new Date(s.date);
            t.setHours(0,0,0,0);
            return t.getTime() <= todayTime;
        });

        // CM Count
        const uniqueCM = new Set(dateFilteredSchedules.filter(s => s.custom_module_code && String(s.custom_module_code).trim() !== '-').map(s => String(s.custom_module_code).trim()));
        document.getElementById('widget-cm').textContent = uniqueCM.size;
        const elapsedCMSize = new Set(elapsedSchedules.filter(s => s.custom_module_code && String(s.custom_module_code).trim() !== '-').map(s => String(s.custom_module_code).trim())).size;

        // GT Count
        const uniqueGT = new Set(dateFilteredSchedules.filter(s => s.marrow_gt && String(s.marrow_gt).trim() !== '-').map(s => String(s.marrow_gt).trim()));
        document.getElementById('widget-gt').textContent = uniqueGT.size;
        const elapsedGTSize = new Set(elapsedSchedules.filter(s => s.marrow_gt && String(s.marrow_gt).trim() !== '-').map(s => String(s.marrow_gt).trim())).size;

        // T&D Count
        const dateFilteredTD = dateFilteredSchedules.filter(s => {
            const combined = `${s.type || ''} ${s.topic || ''}`.toLowerCase();
            return combined.includes('t&d') || combined.includes('test & discussion');
        });
        const elapsedTD = elapsedSchedules.filter(s => {
            const combined = `${s.type || ''} ${s.topic || ''}`.toLowerCase();
            return combined.includes('t&d') || combined.includes('test & discussion');
        });

        const uniqueTD = new Set(dateFilteredTD.map(s => `${String(s.topic || s.subject || '').trim()}-${s.date}`));
        document.getElementById('widget-td').textContent = uniqueTD.size;
        const elapsedTDSize = new Set(elapsedTD.map(s => `${String(s.topic || s.subject || '').trim()}-${s.date}`)).size;
        // ------------------------------------

        // Calculate mapped rows
        let rows = activeStudents.map(student => {
            const metrics = getMetrics(student, dateCondition, dateVal1, dateVal2);
            
            const renderPercentHtml = (count, maxPassed) => {
                if (maxPassed === 0) return '-';
                const p = Math.round((Math.min(count, maxPassed) / maxPassed) * 100);
                return `
                    <div style="display: flex; align-items: center; justify-content: center; gap: 0.4rem;">
                        <span style="font-weight: 600; font-size: 0.95rem;">${p}%</span>
                        <span style="font-size: 0.8rem; opacity: 0.7;">(${count}/${maxPassed})</span>
                    </div>
                `;
            };

            const getPercentVal = (count, maxPassed) => maxPassed === 0 ? -1 : Math.round((Math.min(count, maxPassed) / maxPassed) * 100);

            return {
                enrolment_id: student.enrolment_id || '-',
                name: student.name || '-',
                email_id: student.email_id || '',
                // Raw values for sorting
                cm_percent_val: getPercentVal(metrics.cmCount, elapsedCMSize),
                td_percent_val: getPercentVal(metrics.tdCount, elapsedTDSize),
                gt_percent_val: getPercentVal(metrics.gtCount, elapsedGTSize),
                cm_median_val: metrics.cmMedian === '-' ? -1 : parseFloat(metrics.cmMedian),
                td_median_val: metrics.tdMedian === '-' ? -1 : parseFloat(metrics.tdMedian),
                gt_median_val: metrics.gtMedian === '-' ? -1 : parseFloat(metrics.gtMedian),
                // HTML for rendering
                cm_percent: renderPercentHtml(metrics.cmCount, elapsedCMSize),
                cm_median: metrics.cmMedian,
                td_percent: renderPercentHtml(metrics.tdCount, elapsedTDSize),
                td_median: metrics.tdMedian,
                gt_percent: renderPercentHtml(metrics.gtCount, elapsedGTSize),
                gt_median: metrics.gtMedian
            };
        });

        // Filter by search text
        if (searchQuery) {
            rows = rows.filter(r => 
                r.name.toLowerCase().includes(searchQuery) ||
                r.enrolment_id.toLowerCase().includes(searchQuery)
            );
        }

        // Sort data
        rows.sort((a, b) => {
            let sortCol = currentSortColumn;
            
            // Map the display column to the raw numeric column for sorting
            if (sortCol.includes('percent')) sortCol = sortCol + '_val';
            if (sortCol.includes('median')) sortCol = sortCol + '_val';

            let valA = a[sortCol];
            let valB = b[sortCol];

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return currentSortAsc ? -1 : 1;
            if (valA > valB) return currentSortAsc ? 1 : -1;
            return 0;
        });

        // Render HTML
        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No students found matching your criteria.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(r => `
            <tr>
                <td style="font-weight: 600; color: var(--accent-color);">${r.enrolment_id}</td>
                <td>${r.name}</td>
                <td style="text-align: center;">${r.cm_percent}</td>
                <td style="text-align: center; font-weight: 600;">${r.cm_median !== '-' ? r.cm_median + '%' : '-'}</td>
                <td style="text-align: center;">${r.td_percent}</td>
                <td style="text-align: center; font-weight: 600;">${r.td_median !== '-' ? r.td_median + '%' : '-'}</td>
                <td style="text-align: center;">${r.gt_percent}</td>
                <td style="text-align: center; font-weight: 600;">${r.gt_median !== '-' ? r.gt_median + '%' : '-'}</td>
                <td style="text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding-top: 0.6rem; padding-bottom: 0.6rem;">
                    <button class="add-remark-btn" style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 0.35rem 0.5rem; border-radius: 0.4rem; font-size: 0.75rem; cursor: pointer; transition: all 0.2s; width: 120px;" data-id="${r.enrolment_id}" data-name="${r.name}">Add Remarks</button>
                    <button class="view-onboarding-btn" style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 0.35rem 0.5rem; border-radius: 0.4rem; font-size: 0.75rem; cursor: pointer; transition: all 0.2s; width: 120px;" data-email="${r.email_id}" data-id="${r.enrolment_id}" data-name="${r.name}">Onboarding Form</button>
                </td>
            </tr>
        `).join('');

        // Attach click listeners to all Remark buttons
        document.querySelectorAll('.add-remark-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const name = e.target.getAttribute('data-name');
                openRemarksModal(id, name);
            });
        });

        // Attach click listeners to Onboarding views
        document.querySelectorAll('.view-onboarding-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const id = e.target.getAttribute('data-id');
                const name = e.target.getAttribute('data-name');
                const email = e.target.getAttribute('data-email');
                openOnboardingModal(id, name, email);
            });
        });
    };

    const setupSorting = () => {
        const headers = document.querySelectorAll('th[data-sort]');
        headers.forEach(th => {
            th.addEventListener('click', () => {
                const column = th.getAttribute('data-sort');
                if (currentSortColumn === column) {
                    currentSortAsc = !currentSortAsc;
                } else {
                    currentSortColumn = column;
                    currentSortAsc = true;
                }
                
                // Update icons visually
                headers.forEach(h => h.querySelector('.sort-icon').textContent = '');
                th.querySelector('.sort-icon').textContent = currentSortAsc ? '↑' : '↓';
                
                renderTable();
            });
        });
        
        // Initial sort icon
        const initTh = document.querySelector(`th[data-sort="${currentSortColumn}"]`);
        if(initTh) initTh.querySelector('.sort-icon').textContent = currentSortAsc ? '↑' : '↓';
    };

    // --- ONBOARDING MODAL LOGIC ---
    const openOnboardingModal = async (enrolmentId, studentName, emailId) => {
        document.getElementById('onboarding-view-name').textContent = studentName;
        document.getElementById('onboarding-view-id').textContent = enrolmentId;
        const listDiv = document.getElementById('onboarding-view-content');
        listDiv.innerHTML = `<div style="text-align: center; font-size: 0.8rem; color: var(--text-secondary); padding: 1rem;">Loading profile...</div>`;
        
        document.getElementById('onboarding-view-modal-overlay').classList.add('active');

        try {
            const { data, error } = await supabaseClient
                .from('Onboarding_Data')
                .select('*')
                .eq('email_id', emailId)
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            
            if (!data) {
                // fallback to finding by user_id using enrolment_id because sometimes people sign up matching enrolment to user_id
                const { data: fallbackData } = await supabaseClient
                    .from('Onboarding_Data')
                    .select('*')
                    .eq('user_id', enrolmentId)
                    .limit(1)
                    .maybeSingle();

                if (!fallbackData) {
                    listDiv.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 0.85rem; padding: 1rem; border: 1px dashed var(--glass-border); border-radius: 0.5rem;">This student has not completed the onboarding form yet.</div>`;
                    return;
                } else {
                    renderOnboardingData(listDiv, fallbackData);
                }
            } else {
                renderOnboardingData(listDiv, data);
            }
        } catch (err) {
            console.error("Error fetching onboarding data:", err);
            listDiv.innerHTML = `<div style="color: #ef4444; font-size: 0.8rem; text-align: center;">Error loading profile. Check table permissions.</div>`;
        }
    };

    const renderOnboardingData = (container, data) => {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); padding: 1rem; border-radius: 0.5rem;">
                    <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 0.2rem;">Target Exam</span>
                    <span style="font-size: 1rem; color: #fff;">${data.target_exam || '-'}</span>
                </div>
                <div style="display: flex; gap: 1rem;">
                    <div style="flex: 1; background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); padding: 1rem; border-radius: 0.5rem;">
                        <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 0.2rem;">Target Rank</span>
                        <span style="font-size: 1rem; color: #fff;">${data.target_rank || '-'}</span>
                    </div>
                    <div style="flex: 1; background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); padding: 1rem; border-radius: 0.5rem;">
                        <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 0.2rem;">Latest GT Score</span>
                        <span style="font-size: 1rem; color: #fff;">${data.latest_gt_score !== null ? data.latest_gt_score : '-'} (${data.latest_gt_percentile ? data.latest_gt_percentile + '%ile' : '-'})</span>
                    </div>
                </div>
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); padding: 1rem; border-radius: 0.5rem;">
                    <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 0.5rem;">Biggest Challenge</span>
                    <span style="font-size: 0.9rem; color: #cbd5e1; white-space: pre-wrap;">${data.biggest_challenge || '-'}</span>
                </div>
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); padding: 1rem; border-radius: 0.5rem;">
                    <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 0.5rem;">Mentorship Expectation</span>
                    <span style="font-size: 0.9rem; color: #cbd5e1; white-space: pre-wrap;">${data.mentorship_expectation || '-'}</span>
                </div>
            </div>
        `;
    };

    const closeOnboardingModal = () => document.getElementById('onboarding-view-modal-overlay').classList.remove('active');
    document.getElementById('close-onboarding-view-modal').addEventListener('click', closeOnboardingModal);
    document.getElementById('onboarding-view-modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'onboarding-view-modal-overlay') closeOnboardingModal();
    });

    // --- REMARKS MODAL LOGIC ---
    let currentRemarkStudentId = null;

    const openRemarksModal = async (enrolmentId, studentName) => {
        currentRemarkStudentId = enrolmentId;
        document.getElementById('remarks-student-name').textContent = studentName;
        document.getElementById('remarks-student-id').textContent = enrolmentId;
        document.getElementById('new-remark-text').value = '';
        
        const listDiv = document.getElementById('remarks-list');
        listDiv.innerHTML = `<div style="text-align: center; font-size: 0.8rem; color: var(--text-secondary); padding: 1rem;">Loading comments...</div>`;
        
        document.getElementById('remarks-modal-overlay').classList.add('active');

        // Fetch remarks
        try {
            const { data, error } = await supabaseClient
                .from('Student_Remarks')
                .select('*')
                .eq('enrolment_id', enrolmentId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            
            renderRemarksList(data || []);
        } catch (err) {
            console.error("Error fetching remarks:", err);
            listDiv.innerHTML = `<div style="color: #ef4444; font-size: 0.8rem;">Could not load past remarks. Make sure the Student_Remarks table exists in your database.</div>`;
        }
    };

    const renderRemarksList = (remarks) => {
        const listDiv = document.getElementById('remarks-list');
        if (remarks.length === 0) {
            listDiv.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 0.85rem; padding: 1rem; border: 1px dashed var(--glass-border); border-radius: 0.5rem;">No remarks for this student yet.</div>`;
            return;
        }

        listDiv.innerHTML = remarks.map(row => {
            const dateObj = new Date(row.created_at);
            const dateFormatted = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); padding: 1rem; border-radius: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem; gap: 1rem;">
                        <span style="font-weight: 600; font-size: 0.85rem; color: #fff;">${row.author_name}</span>
                        <span style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap;">${dateFormatted}</span>
                    </div>
                    <div style="font-size: 0.9rem; color: #cbd5e1; line-height: 1.5; white-space: pre-wrap;">${row.comment}</div>
                </div>
            `;
        }).join('');
    };

    // Close Modal Events
    const closeModal = () => document.getElementById('remarks-modal-overlay').classList.remove('active');
    document.getElementById('close-remarks-modal').addEventListener('click', closeModal);
    document.getElementById('remarks-modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'remarks-modal-overlay') closeModal();
    });

    // Save New Remark
    document.getElementById('submit-remark-btn').addEventListener('click', async () => {
        const txt = document.getElementById('new-remark-text').value.trim();
        if (!txt) return;

        const btn = document.getElementById('submit-remark-btn');
        btn.textContent = "Saving...";
        btn.disabled = true;

        try {
            const { error } = await supabaseClient.from('Student_Remarks').insert([{
                enrolment_id: currentRemarkStudentId,
                author_email: currentUser.email_id.toLowerCase(),
                author_name: currentUser.name,
                comment: txt
            }]);

            if (error) throw error;
            
            // Reload remarks
            openRemarksModal(currentRemarkStudentId, document.getElementById('remarks-student-name').textContent);
        } catch (err) {
            console.error("Error saving remark:", err);
            alert("Failed to save the remark. Please make sure the SQL Migration has been run.");
        } finally {
            btn.textContent = "Save Remark";
            btn.disabled = false;
        }
    });

    init();
});
