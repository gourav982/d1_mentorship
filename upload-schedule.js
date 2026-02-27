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

    const fileInput = document.getElementById('csv-file-input');
    const fileNameDisplay = document.getElementById('file-name-display');
    const processBtn = document.getElementById('process-upload-btn');
    const statusDiv = document.getElementById('upload-status');
    const centreSelect = document.getElementById('upload-centre');
    const downloadBtn = document.getElementById('download-sample-btn');

    // 2.5 Fetch Centres
    const fetchCentres = async () => {
        const { data: centres } = await supabaseClient.from('Centres').select('name').order('name');
        if (centres) {
            centreSelect.innerHTML = centres.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        }
    };
    fetchCentres();

    // 3. Sample CSV Functionality
    downloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const headers = "Date, Topic, Custom Module Code, Start Date & Time, End Date & Time, Number of Questions\n";
        const sampleRow = "2026-03-01, Anatomy: Lower Limb, ANA-LL-01, 2026-03-01 10:00:00, 2026-03-01 12:00:00, 50\n";

        const blob = new Blob([headers + sampleRow], { type: 'text/csv' });
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
            fileNameDisplay.textContent = 'Click to browse files (Date, Topic, Module, Start, End, Qs)';
            processBtn.disabled = true;
        }
    });

    // 5. Upload Logic
    processBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        const reader = new FileReader();

        processBtn.disabled = true;
        processBtn.textContent = 'Syncing to Supabase...';
        statusDiv.style.display = 'none';

        reader.onload = async (event) => {
            try {
                const text = event.target.result;
                const rows = text.split('\n').filter(row => row.trim() !== "");

                // Skip header: Date, Topic, Code, Start, End, Qs
                const payload = rows.slice(1).map((row, index) => {
                    const cols = row.split(',').map(c => c.trim());
                    if (cols.length < 6) return null;

                    return {
                        centre_name: centreSelect.value,
                        date: cols[0],
                        topic: cols[1],
                        custom_module_code: cols[2],
                        start_datetime: cols[3],
                        end_datetime: cols[4],
                        num_questions: parseInt(cols[5]) || 0
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
                fileNameDisplay.textContent = 'Click to browse files (Date, Topic, Module, Start, End, Qs)';
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
                processBtn.textContent = 'Sync to Database';
            }
        };

        reader.readAsText(file);
    });
});
