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

    // Show Admin Section
    const adminSec = document.getElementById('admin-section');
    if (adminSec) adminSec.style.display = 'block';

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
    const downloadBtn = document.getElementById('download-sample-btn');

    // 2. Sample Results CSV Functionality
    downloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const headers = "Enrolment ID,Test Type,Test Code,Score,Percentile";
        const sampleRows = [
            "D1-1001,Custom Module,ANA-LL-01,85,92",
            "D1-1002,T&D,PATH-TD-01,70,78",
            "D1-1001,Marrow GT,Marrow GT 14,145,95"
        ].join("\n");
        const blob = new Blob([headers + "\n" + sampleRows], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sample_results.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            fileNameDisplay.textContent = `Selected: ${file.name}`;
            processBtn.disabled = false;
        } else {
            fileNameDisplay.textContent = 'Format: Enrolment ID, Test Type, Test Code, Score, Percentile';
            processBtn.disabled = true;
        }
    });

    processBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        processBtn.disabled = true;
        processBtn.textContent = 'Processing...';
        showStatus('Reading file...', 'info');

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target.result;
                const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
                if (lines.length < 2) throw new Error('CSV file is empty or missing headers.');

                // Expected Headers: Enrolment ID, Test Type, Test Code, Score, Percentile
                const results = [];
                for (let i = 1; i < lines.length; i++) {
                    const columns = lines[i].split(',').map(c => c.trim());
                    if (columns.length < 3) continue; // Skip malformed lines

                    results.push({
                        enrolment_id: columns[0],
                        test_type: columns[1] || 'Custom Module',
                        custom_module_code: columns[2], // We use this internal column name for 'Test Code'
                        score: columns[3] || '-',
                        percentile: columns[4] || '-'
                    });
                }

                if (results.length === 0) throw new Error('No valid data found in CSV.');

                showStatus(`Uploading ${results.length} records...`, 'info');

                // Batch Upsert using enrolment_id + test_code + test_type as unique key
                const { error } = await supabaseClient
                    .from('Test_Results')
                    .upsert(results, { onConflict: 'enrolment_id,custom_module_code,test_type' });

                if (error) throw error;

                showStatus(`Successfully uploaded ${results.length} result(s)!`, 'success');
                fileInput.value = '';
                fileNameDisplay.textContent = 'Format: Enrolment ID, Test Type, Test Code, Score, Percentile';
            } catch (err) {
                console.error(err);
                showStatus(`Error: ${err.message}`, 'error');
            } finally {
                processBtn.disabled = false;
                processBtn.textContent = 'Upload Results';
            }
        };
        reader.readAsText(file);
    });

    function showStatus(msg, type) {
        statusDiv.style.display = 'block';
        statusDiv.textContent = msg;
        statusDiv.style.background = type === 'error' ? 'rgba(239, 68, 68, 0.1)' :
            type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(56, 189, 248, 0.1)';
        statusDiv.style.color = type === 'error' ? '#ef4444' :
            type === 'success' ? '#22c55e' : '#38bdf8';
        statusDiv.style.border = `1px solid ${statusDiv.style.color}`;
    }
});
