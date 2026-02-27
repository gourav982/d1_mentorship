document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth check
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.replace('index.html'); return; }

    const { data: userData } = await supabaseClient
        .from('Access')
        .select('*')
        .ilike('email_id', session.user.email)
        .single();

    const adminRoles = ['Super admin', 'Admin', 'Mentor', 'Academics'];
    if (!userData || !adminRoles.includes(userData.role)) {
        window.location.replace('dashboard.html');
        return;
    }

    // 2. UI Init
    document.body.style.display = 'block';
    document.getElementById('display-name').textContent = userData.name || 'Admin';
    document.getElementById('display-role').textContent = userData.role;
    document.getElementById('avatar-circle').textContent = (userData.name || 'A').charAt(0).toUpperCase();

    const centresBody = document.getElementById('centres-body');
    const addModal = document.getElementById('add-centre-modal');
    const addForm = document.getElementById('add-centre-form');
    const editModal = document.getElementById('edit-centre-modal');
    const editForm = document.getElementById('edit-centre-form');

    // 3. Fetch & Render
    const fetchCentres = async () => {
        try {
            let { data, error } = await supabaseClient
                .from('Centres')
                .select('*')
                .order('name', { ascending: true });

            if (error) {
                if (error.code === 'PGRST116' || error.message.includes('schema cache')) {
                    // Table doesn't exist yet, fallback to Access
                    const { data: accessData } = await supabaseClient.from('Access').select('centre_name');
                    if (accessData) {
                        const unique = [...new Set(accessData.map(u => u.centre_name).filter(Boolean))];
                        data = unique.map((name, i) => ({ id: `fallback-${i}`, name, location: 'Synced from Users' }));
                    }
                    showSetupNotice();
                } else {
                    throw error;
                }
            }
            renderCentres(data);
        } catch (err) {
            console.error('Fetch Error:', err);
            centresBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#ef4444; padding:2rem;">Error: ${err.message}</td></tr>`;
        }
    };

    const showSetupNotice = () => {
        const notice = document.createElement('div');
        notice.style.background = 'rgba(234, 179, 8, 0.1)';
        notice.style.border = '1px solid #eab308';
        notice.style.color = '#eab308';
        notice.style.padding = '1rem';
        notice.style.borderRadius = '0.75rem';
        notice.style.marginBottom = '1.5rem';
        notice.style.fontSize = '0.9rem';
        notice.innerHTML = `
            <strong>Schema Setup Required:</strong> To enable full management (location editing, etc.), please run the <strong>centres_migration.sql</strong> script in your Supabase SQL Editor. Currently showing centres from your User list.
        `;
        document.querySelector('.admin-page-header').after(notice);
    };

    const renderCentres = (centres) => {
        if (!centres || centres.length === 0) {
            centresBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 3rem; color: var(--text-secondary);">No centres found. Click "+ Add New Centre" to begin.</td></tr>';
            return;
        }

        centresBody.innerHTML = centres.map(c => `
            <tr style="border-bottom: 1px solid var(--glass-border);">
                <td style="padding: 1rem 1.25rem;">
                    <div style="font-weight: 600; color: var(--text-primary);">${c.name}</div>
                </td>
                <td style="padding: 1rem 1.25rem; color: var(--text-secondary);">${c.location || '-'}</td>
                <td style="padding: 1rem 1.25rem; text-align: center;">
                    <div style="display: flex; gap: 0.5rem; justify-content: center;">
                        <button class="action-btn" onclick="window.openEditModal('${c.id}', '${c.name}', '${c.location}')" style="background: rgba(56, 189, 248, 0.1); color: var(--accent-color); padding: 0.4rem 0.8rem; border-radius: 0.5rem; border: none; cursor: pointer; font-size: 0.8rem;">Edit</button>
                        <button class="action-btn" onclick="window.deleteCentre('${c.id}', '${c.name}')" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 0.4rem 0.8rem; border-radius: 0.5rem; border: none; cursor: pointer; font-size: 0.8rem;">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
    };

    // 4. CRUD Handlers
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('centre-name').value.trim();
        const location = document.getElementById('centre-location').value.trim();
        const btn = addForm.querySelector('button[type="submit"]');

        btn.disabled = true;
        btn.textContent = 'Saving...';

        const { error } = await supabaseClient.from('Centres').insert([{ name, location }]);

        if (error) {
            alert('Error adding centre: ' + error.message);
        } else {
            addForm.reset();
            addModal.classList.remove('active');
            fetchCentres();
        }
        btn.disabled = false;
        btn.textContent = 'Save Centre';
    });

    window.openEditModal = (id, name, location) => {
        document.getElementById('edit-centre-id').value = id;
        document.getElementById('edit-centre-name').value = name;
        document.getElementById('edit-centre-location').value = location === 'null' ? '' : location;
        editModal.classList.add('active');
    };

    editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-centre-id').value;
        const name = document.getElementById('edit-centre-name').value.trim();
        const location = document.getElementById('edit-centre-location').value.trim();
        const btn = editForm.querySelector('button[type="submit"]');

        btn.disabled = true;
        btn.textContent = 'Saving...';

        const { error } = await supabaseClient
            .from('Centres')
            .update({ name, location })
            .eq('id', id);

        if (error) {
            alert('Error updating centre: ' + error.message);
        } else {
            editModal.classList.remove('active');
            fetchCentres();
        }
        btn.disabled = false;
        btn.textContent = 'Save Changes';
    });

    window.deleteCentre = async (id, name) => {
        if (confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
            const { error } = await supabaseClient.from('Centres').delete().eq('id', id);
            if (error) {
                alert('Error deleting centre: ' + error.message);
            } else {
                fetchCentres();
            }
        }
    };

    // 5. Initial Load
    fetchCentres();
});
