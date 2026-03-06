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
    if (adminSec) {
        adminSec.style.display = 'block';

        // Hide super-admin only items if current user is not super admin
        if (userData.role !== 'Super admin') {
            document.querySelectorAll('.super-admin-only').forEach(el => el.style.display = 'none');
        }
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
    const downloadExistingBtn = document.getElementById('download-existing-btn');

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
    downloadBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const headers = "Date, Subject, Type, Topic, Marrow GT, Custom Module Code, Start Date & Time, End Date & Time, MCQs\n";
        const sampleRowArr = [
            '2026-03-01, Anatomy, "Study Day", "Anatomy Lower Limb", -, ANA-LL-01, "2026-03-01 10:00:00", "2026-03-01 12:00:00", 50\n',
        ];
        const blob = new Blob([headers + sampleRowArr.join("")], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('href', url);
        a.setAttribute('download', 'mentorship_schedule_sample.csv');
        a.click();
    });

    // 3.1 Download Existing Schedule
    downloadExistingBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        const centre = centreSelect.value;
        downloadExistingBtn.textContent = 'Fetching...';

        try {
            const { data, error } = await supabaseClient
                .from('Schedule')
                .select('id, date, subject, type, topic, marrow_gt, custom_module_code, start_datetime, end_datetime, num_questions')
                .eq('centre_name', centre)
                .order('date', { ascending: true });

            if (error) throw error;
            if (!data || data.length === 0) {
                alert(`No existing schedule found for ${centre}.`);
                return;
            }

            const headers = "UUID (ID), Date, Subject, Type, Topic, Marrow GT, Custom Module Code, Start Date & Time, End Date & Time, MCQs\n";
            const csvRows = data.map(row => {
                const parts = [
                    row.id,
                    row.date,
                    row.subject,
                    row.type,
                    row.topic,
                    row.marrow_gt,
                    row.custom_module_code || '',
                    row.start_datetime || '',
                    row.end_datetime || '',
                    row.num_questions || ''
                ];
                // Wrap in quotes and escape internal quotes
                return parts.map(p => `"${String(p).replace(/"/g, '""')}"`).join(',');
            });

            const blob = new Blob([headers + csvRows.join("\n")], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('download', `schedule_${centre.toLowerCase().replace(/\s/g, '_')}_current.csv`);
            a.click();
        } catch (err) {
            console.error(err);
            alert('Failed to download: ' + err.message);
        } finally {
            downloadExistingBtn.textContent = 'Download Existing Schedule';
        }
    });

    // Simple robust CSV line splitter helper
    const splitCSVLine = (line) => {
        const parts = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    cur += '"'; // Doubled quote
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                parts.push(cur.trim());
                cur = '';
            } else {
                cur += char;
            }
        }
        parts.push(cur.trim());
        return parts;
    };

    // 4. File Selection
    fileInput.addEventListener('change', (e) => {
        if (fileInput.files.length > 0) {
            fileNameDisplay.textContent = fileInput.files[0].name;
            fileNameDisplay.style.color = 'var(--accent-color)';
            processBtn.disabled = false;
        } else {
            fileNameDisplay.textContent = 'Click to browse files...';
            processBtn.disabled = true;
        }
    });

    // 5. Upload Logic
    processBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        const reader = new FileReader();

        processBtn.disabled = true;
        processBtn.textContent = 'Processing...';
        statusDiv.style.display = 'none';

        reader.onload = async (event) => {
            try {
                const text = event.target.result;
                const rows = text.split('\n').filter(row => row.trim() !== "");
                if (rows.length < 2) throw new Error("CSV is empty or missing data.");

                // Helper to parse date string
                const parseDate = (d) => {
                    if (!d || d.trim() === "") return null;
                    d = d.trim().replace(/^"|"$/g, '');
                    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
                    const parts = d.split(/[/-]/);
                    if (parts.length === 3) {
                        let p1 = parts[0].padStart(2, '0');
                        let p2 = parts[1].padStart(2, '0');
                        let p3 = parts[2];
                        if (p1.length === 4) return `${p1}-${p2}-${p3.padStart(2, '0')}`;
                        if (p3.length === 2) p3 = '20' + p3;
                        return `${p3}-${p2}-${p1}`;
                    }
                    return d;
                };

                let lastDate = null;
                let lastSubject = null;

                const headerLine = rows[0].toLowerCase();
                const hasUUID = headerLine.includes('uuid') || headerLine.includes('id');

                const payload = rows.slice(1).map((row) => {
                    if (!row.trim()) return null;
                    const cleanCols = splitCSVLine(row);

                    if (cleanCols.length < 5) return null;

                    let shift = hasUUID ? 1 : 0;
                    let rawDate = cleanCols[0 + shift];
                    let currentSubject = cleanCols[1 + shift];

                    // Carry forward
                    if (!rawDate || rawDate === "") rawDate = lastDate;
                    else lastDate = rawDate;

                    if (!currentSubject || currentSubject === "") currentSubject = lastSubject;
                    else lastSubject = currentSubject;

                    const standardDate = parseDate(rawDate);
                    if (!standardDate) return null;

                    const topic = cleanCols[3 + shift];
                    if (!topic) return null;

                    const obj = {
                        centre_name: centreSelect.value,
                        date: standardDate,
                        subject: currentSubject || '-',
                        type: cleanCols[2 + shift] || 'Study Day',
                        topic: topic,
                        marrow_gt: cleanCols[4 + shift] || '-',
                        custom_module_code: cleanCols[5 + shift] || null,
                        start_datetime: (cleanCols[6 + shift] && cleanCols[6 + shift] !== '-' && cleanCols[6 + shift] !== '') ? cleanCols[6 + shift] : null,
                        end_datetime: (cleanCols[7 + shift] && cleanCols[7 + shift] !== '-' && cleanCols[7 + shift] !== '') ? cleanCols[7 + shift] : null,
                        num_questions: (cleanCols[8 + shift] && cleanCols[8 + shift] !== '' && cleanCols[8 + shift] !== '-') ? parseInt(cleanCols[8 + shift]) : null
                    };

                    if (hasUUID && cleanCols[0] && cleanCols[0].length > 10) {
                        obj.id = cleanCols[0];
                    }

                    return obj;
                }).filter(p => p !== null);

                if (payload.length === 0) throw new Error("No valid records found in file.");

                const { error } = await supabaseClient
                    .from('Schedule')
                    .upsert(payload, { onConflict: hasUUID ? 'id' : 'centre_name, date, topic' });

                if (error) throw error;

                statusDiv.style.display = 'block';
                statusDiv.style.background = 'rgba(34, 197, 94, 0.1)';
                statusDiv.style.border = '1px solid #22c55e';
                statusDiv.style.color = '#22c55e';
                statusDiv.textContent = `Successfully synced ${payload.length} records!`;

            } catch (err) {
                console.error(err);
                statusDiv.style.display = 'block';
                statusDiv.style.background = 'rgba(239, 68, 68, 0.1)';
                statusDiv.style.border = '1px solid #ef4444';
                statusDiv.style.color = '#ef4444';
                statusDiv.textContent = 'Error: ' + err.message;
            } finally {
                processBtn.disabled = false;
                processBtn.textContent = 'Upload Schedule';
            }
        };
        reader.readAsText(file);
    });
});
