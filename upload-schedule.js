document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth & Role Barrier
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }

    const { data: userData, error: fetchError } = await supabaseClient
        .from('Access')
        .select('*')
        .ilike('email_id', session.user.email)
        .single();

    const adminRoles = ['Super admin', 'Admin', 'Mentor', 'Academics'];
    if (fetchError || !userData || !adminRoles.includes(userData.role)) {
        window.location.replace('dashboard.html');
        return;
    }

    // Force redirection to dashboard if first login/reset is needed (since that's where the modal is)
    if (userData.is_first_login) {
        window.location.replace('dashboard.html');
        return;
    }

    // 2. UI Elements
    document.body.style.display = 'block';
    document.getElementById('display-name').textContent = userData.name || 'Admin';
    document.getElementById('display-role').textContent = userData.role;
    document.getElementById('avatar-circle').textContent = (userData.name || 'A').charAt(0).toUpperCase();

    // Sidebar Toggle
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    toggleBtn?.addEventListener('click', () => {
        sidebar?.classList.toggle('collapsed');
    });

    const fileInput = document.getElementById('csv-file-input');
    const fileNameDisplay = document.getElementById('file-name-display');
    const processBtn = document.getElementById('process-upload-btn');
    const statusDiv = document.getElementById('upload-status');
    const centreSelect = document.getElementById('upload-centre');
    const downloadBtn = document.getElementById('download-sample-btn');

    // 2.5 Fetch Centres
    const fetchCentres = async () => {
        let { data: centres, error } = await supabaseClient.from('Centres').select('name').order('name');

        if (error || !centres || centres.length === 0) {
            const { data: accessData } = await supabaseClient.from('Access').select('centre_name');
            if (accessData) {
                const unique = [...new Set(accessData.map(u => u.centre_name).filter(Boolean))];
                centres = unique.sort().map(name => ({ name }));
            }
        }

        if (centres) {
            centreSelect.innerHTML = centres.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        }
    };
    fetchCentres();

    // 3. Sample CSV Functionality
    downloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const headers = "Date, Subject, Type, Topic, Marrow GT, Custom Module Code, Start Date & Time, End Date & Time, MCQs\n";
        const sampleRowArr = [
            "2026-03-01, Anatomy, Study Day, Lower Limb, -, ANA-LL-01, 2026-03-01 10:00:00, 2026-03-01 12:00:00, 50\n",
            "2026-03-05, Anatomy, GT Day, Upper Limb, NEET PG Marrow GT, ANA-LL-02, 2026-03-05 10:00:00, 2026-03-05 12:00:00, 50\n"
        ];

        const blob = new Blob([headers + sampleRowArr.join("")], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('download', 'mentorship_schedule_sample.csv');
        a.click();
    });

    // 4. File Selection
    fileInput.addEventListener('change', (e) => {
        if (fileInput.files.length > 0) {
            fileNameDisplay.textContent = fileInput.files[0].name;
            fileNameDisplay.style.color = 'var(--accent-color)';
            processBtn.disabled = false;
        } else {
            fileNameDisplay.textContent = 'Click to browse files (Date, Subject, Topic, Custom Module Code, Start, End, Qs)';
            processBtn.disabled = true;
        }
    });

    // 5. Upload Logic
    processBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        const reader = new FileReader();

        processBtn.disabled = true;
        processBtn.textContent = 'Uploading...';
        statusDiv.style.display = 'none';

        reader.onload = async (event) => {
            try {
                const text = event.target.result;
                const rows = text.split('\n').filter(row => row.trim() !== "");

                // Helper to parse date string (handles DD/MM/YYYY, DD/MM/YY, and YYYY-MM-DD)
                const parseDate = (d) => {
                    if (!d) return null;
                    // If already YYYY-MM-DD
                    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;

                    // Handle DD/MM/YYYY or DD-MM-YYYY
                    const parts = d.split(/[/-]/);
                    if (parts.length === 3) {
                        let day = parts[0].padStart(2, '0');
                        let month = parts[1].padStart(2, '0');
                        let year = parts[2];
                        if (year.length === 2) year = '20' + year;

                        // If the first part is 4 digits, it's likely YYYY-MM-DD already but split
                        if (day.length === 4) return `${day}-${month}-${parts[0].padStart(2, '0')}`;

                        return `${year}-${month}-${day}`;
                    }
                    return d;
                };

                // Headers: Date, Subject, Type, Topic, Marrow GT, Code, Start, End, MCQs
                const payload = rows.slice(1).map((row, index) => {
                    const cols = row.split(',').map(c => c.trim());
                    if (cols.length < 9) return null;

                    const rawDate = cols[0];
                    const standardDate = parseDate(rawDate);

                    return {
                        centre_name: centreSelect.value,
                        date: standardDate,
                        subject: cols[1],
                        type: cols[2] || 'Study Day',
                        topic: cols[3],
                        marrow_gt: cols[4] || '-',
                        custom_module_code: cols[5] || null,
                        start_datetime: cols[6] || null,
                        end_datetime: cols[7] || null,
                        num_questions: (cols[8] && cols[8] !== '') ? parseInt(cols[8]) : null
                    };
                }).filter(p => p !== null);

                if (payload.length === 0) throw new Error("No valid data found in CSV. Check your formatting.");

                // Insert into "Schedule" table
                const { error } = await supabaseClient.from('Schedule').insert(payload);

                if (error) throw error;

                statusDiv.style.display = 'block';
                statusDiv.style.background = 'rgba(34, 197, 94, 0.1)';
                statusDiv.style.border = '1px solid #22c55e';
                statusDiv.style.color = '#22c55e';
                statusDiv.textContent = `Successfully synced ${payload.length} rows for ${centreSelect.value} centre!`;

                fileInput.value = '';
                fileNameDisplay.textContent = 'Click to browse files (Date, Subject, Topic, Custom Module Code, Start, End, Qs)';
                fileNameDisplay.style.color = 'var(--text-secondary)';

            } catch (err) {
                console.error('Upload Error:', err);
                statusDiv.style.display = 'block';
                statusDiv.style.background = 'rgba(239, 68, 68, 0.1)';
                statusDiv.style.border = '1px solid #ef4444';
                statusDiv.style.color = '#ef4444';
                statusDiv.textContent = 'Error: ' + err.message;
            } finally {
                processBtn.disabled = true;
                processBtn.textContent = 'Upload Schedule';
            }
        };

        reader.readAsText(file);
    });
});
