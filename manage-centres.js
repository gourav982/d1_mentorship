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

    const centresContainer = document.getElementById('centres-container');
    const addForm = document.getElementById('add-centre-form');
    const editModal = document.getElementById('edit-centre-modal');
    const editForm = document.getElementById('edit-centre-form');

    // 3. Fetch & Render
    const fetchCentres = async () => {
        const { data, error } = await supabaseClient
            .from('Centres')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching centres:', error);
            return;
        }

        renderCentres(data);
    };

    const renderCentres = (centres) => {
        if (!centres || centres.length === 0) {
            centresContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">No centres found. Add your first centre above.</div>';
            return;
        }

        centresContainer.innerHTML = centres.map(c => `
            <div class="centre-card">
                <div class="centre-info">
                    <h3>${c.name}</h3>
                    <p>${c.location || 'No location set'}</p>
                </div>
                <div class="centre-actions">
                    <button class="action-btn btn-edit" onclick="window.openEditModal('${c.id}', '${c.name}', '${c.location}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        Edit
                    </button>
                    <button class="action-btn btn-delete" onclick="window.deleteCentre('${c.id}', '${c.name}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
    };

    // 4. CRUD Handlers
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('centre-name').value.trim();
        const location = document.getElementById('centre-location').value.trim();
        const btn = addForm.querySelector('button');

        btn.disabled = true;
        btn.textContent = 'Adding...';

        const { error } = await supabaseClient.from('Centres').insert([{ name, location }]);

        if (error) {
            alert('Error adding centre: ' + error.message);
        } else {
            addForm.reset();
            fetchCentres();
        }
        btn.disabled = false;
        btn.textContent = 'Add Centre';
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
